import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { AppError } from "./domain";
import { verifyGoogle } from "./auth";

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;
const local = () => !process.env.AWS_LAMBDA_FUNCTION_NAME;
const cookieName = () => local() ? "stats-local-session" : "__Host-stats-session";
const stateCookieName = () => local() ? "stats-local-oauth-state" : "__Host-stats-oauth-state";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let documentClient: DynamoDBDocumentClient | undefined;
const ddb = () => documentClient ??= DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION ?? process.env.SOURCE_REGION,
  ...(process.env.DATA_MODE === "dynamo-local"
    ? { endpoint: process.env.DYNAMODB_ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } }
    : {}),
}));
const table = () => {
  const name = process.env.SESSION_TABLE_NAME ??
    (process.env.DATA_MODE === "dynamo-local" ? process.env.TABLE_NAME : undefined);
  if (!name) throw new AppError(503, "AUTH_CONFIG", "Stats sessions are not configured.");
  return name;
};
const oauthOrigin = () => {
  const origin = process.env.ALLOWED_ORIGIN ?? (local() ? "http://127.0.0.1:4300" : undefined);
  if (!origin) throw new AppError(503, "AUTH_CONFIG", "OAuth callback origin is not configured.");
  return origin;
};
const ssm = new SSMClient({});
let secretCache: string | undefined;

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${local() ? "" : "; Secure"}`;
}
function clearCookie(name: string) { return cookie(name, "", 0); }
type RequestHeaders = Record<string, string | string[] | undefined>;
export function requestHeaders(headers: RequestHeaders, cookies?: string[]): RequestHeaders {
  if (!cookies?.length) return headers;
  const raw = headers.cookie ?? headers.Cookie;
  const headerCookie = Array.isArray(raw) ? raw.join(";") : raw;
  return { ...headers, cookie: [headerCookie, ...cookies].filter(Boolean).join(";") };
}
function cookieValue(headers: RequestHeaders, name: string) {
  const raw = headers.cookie ?? headers.Cookie;
  const value = Array.isArray(raw) ? raw.join(";") : raw;
  return value?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
function response(statusCode: number, body: unknown, headers: Record<string, string> = {}, cookies: string[] = []) {
  return { statusCode, headers: { "cache-control": "no-store", ...headers }, ...(cookies.length ? { cookies } : {}), body: typeof body === "string" ? body : JSON.stringify(body) };
}
function redirect(location: string, cookies: string[] = []) {
  return { statusCode: 303, headers: { location, "cache-control": "no-store" }, cookies, body: "" };
}
async function clientSecret() {
  if (!local() && secretCache) return secretCache;
  const parameter = process.env.GOOGLE_CLIENT_SECRET_PARAMETER;
  const value = local() ? process.env.GOOGLE_CLIENT_SECRET : parameter
    ? (await ssm.send(new GetParameterCommand({ Name: parameter, WithDecryption: true }))).Parameter?.Value
    : undefined;
  if (!value) throw new AppError(503, "AUTH_CONFIG", "Google OAuth client secret is unavailable.");
  secretCache = value;
  return value;
}
export async function beginOAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new AppError(503, "AUTH_CONFIG", "Google sign-in is not configured.");
  const origin = oauthOrigin();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_SECONDS * 1000).toISOString();
  await ddb().send(new PutCommand({ TableName: table(), Item: {
    pk: `OAUTH#${hash(state)}`, sk: "METADATA", verifier, nonce, expiresAt,
    ttl: Math.floor(Date.now() / 1000) + OAUTH_SECONDS,
  } }));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: `${origin}/api/auth/callback`,
    response_type: "code", scope: "openid email profile", state, nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256", hd: "stmarobotics.org",
  }).toString();
  return redirect(url.toString(), [cookie(stateCookieName(), state, OAUTH_SECONDS)]);
}
export async function finishOAuth(event: any) {
  const headers = requestHeaders(event.headers ?? {}, event.cookies);
  const state = event.queryStringParameters?.state;
  const fromCookie = cookieValue(headers, stateCookieName());
  const clearState = clearCookie(stateCookieName());
  const stateMatches = !!state && !!fromCookie &&
    Buffer.byteLength(state) === Buffer.byteLength(fromCookie) &&
    timingSafeEqual(Buffer.from(state), Buffer.from(fromCookie));
  let failureStage = "validate_state";
  try {
    if (!state) {
      failureStage = "validate_state_query";
      throw new AppError(401, "LOGIN_EXPIRED", "Sign-in could not be verified. Please try again.");
    }
    if (!fromCookie) {
      failureStage = "validate_state_cookie";
      throw new AppError(401, "LOGIN_EXPIRED", "Sign-in could not be verified. Please try again.");
    }
    if (!stateMatches) {
      failureStage = "validate_state_match";
      throw new AppError(401, "LOGIN_EXPIRED", "Sign-in could not be verified. Please try again.");
    }
    failureStage = "consume_oauth_state";
    let pending;
    try {
      pending = await ddb().send(new UpdateCommand({
        TableName: table(), Key: { pk: `OAUTH#${hash(state)}`, sk: "METADATA" },
        UpdateExpression: "SET #consumed = :true",
        ConditionExpression: "attribute_exists(pk) AND expiresAt > :now AND attribute_not_exists(#consumed)",
        ExpressionAttributeNames: { "#consumed": "consumed" },
        ExpressionAttributeValues: { ":true": true, ":now": new Date().toISOString() },
        ReturnValues: "ALL_OLD",
      }));
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException")
        throw new AppError(401, "LOGIN_EXPIRED", "Sign-in expired or was already used. Please try again.");
      throw error;
    }
    failureStage = "validate_oauth_response";
    const item = pending.Attributes;
    if (!item) throw new AppError(401, "LOGIN_EXPIRED", "Sign-in expired or was already used. Please try again.");
    const code = event.queryStringParameters?.code;
    if (!code) throw new AppError(401, "LOGIN_EXPIRED", "Google did not return an authorization code.");
    failureStage = "exchange_google_token";
    const origin = oauthOrigin();
    const secret = await clientSecret();
    const exchange = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: secret,
        redirect_uri: `${origin}/api/auth/callback`, grant_type: "authorization_code",
        code_verifier: item.verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!exchange.ok) throw new AppError(401, "LOGIN_EXPIRED", "Google sign-in could not be completed. Please try again.");
    const tokens = await exchange.json() as { id_token?: string };
    if (!tokens.id_token) throw new AppError(401, "LOGIN_EXPIRED", "Google did not return an identity token.");
    failureStage = "verify_google_identity";
    let claims;
    try {
      claims = await new OAuth2Client().verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    } catch {
      throw new AppError(401, "LOGIN_EXPIRED", "Google sign-in could not be verified. Please try again.");
    }
    const payload = claims.getPayload() as TokenPayload | undefined;
    const verified = await verifyGoogle(tokens.id_token, process.env.GOOGLE_CLIENT_ID);
    if (!payload?.nonce || Buffer.byteLength(payload.nonce) !== Buffer.byteLength(item.nonce) ||
      !timingSafeEqual(Buffer.from(payload.nonce), Buffer.from(item.nonce))) {
      throw new AppError(401, "LOGIN_EXPIRED", "Google sign-in could not be verified. Please try again.");
    }
    failureStage = "save_session";
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + SESSION_SECONDS * 1000);
    await ddb().send(new PutCommand({ TableName: table(), Item: {
      pk: `SESSION#${hash(token)}`, sk: "METADATA", sub: verified.sub, email: verified.email,
      expiresAt: expires.toISOString(), ttl: Math.floor(expires.getTime() / 1000),
    } }));
    return redirect("/", [clearState, cookie(cookieName(), token, SESSION_SECONDS)]);
  } catch (error) {
    console.error(JSON.stringify({
      event: "oauth.callback.failure",
      errorType: error instanceof AppError ? "AppError" : error instanceof Error ? error.name : "unknown",
      stage: failureStage,
      ...(error instanceof AppError ? { errorCode: error.code, status: error.status } : {}),
      ...(local() && failureStage.startsWith("validate_state")
        ? { statePresent: !!state, stateCookiePresent: !!fromCookie, stateMatches }
        : {}),
      ...(local() && error instanceof Error && error.name === "ValidationException"
        ? { errorMessage: error.message }
        : {}),
    }));
    return response(error instanceof AppError ? error.status : 503,
      { code: error instanceof AppError ? error.code : "AUTH_UNAVAILABLE", message: error instanceof AppError ? error.message : "Google sign-in is temporarily unavailable. Please try again." },
      { "content-type": "application/json" }, [clearState]);
  }
}
export async function getSession(headers: RequestHeaders) {
  const token = cookieValue(headers, cookieName());
  if (!token) throw new AppError(401, "LOGIN_REQUIRED", "Sign in with your STMA Robotics Google account.");
  const result = await ddb().send(new GetCommand({ TableName: table(), Key: { pk: `SESSION#${hash(token)}`, sk: "METADATA" }, ConsistentRead: true }));
  const item = result.Item;
  if (
    typeof item?.sub !== "string" ||
    typeof item.email !== "string" ||
    typeof item.expiresAt !== "string" ||
    item.expiresAt <= new Date().toISOString()
  )
    throw new AppError(401, "LOGIN_EXPIRED", "Your sign-in expired. Sign in again.");
  return { sub: item.sub as string, email: item.email as string };
}
export async function endSession(headers: RequestHeaders) {
  const token = cookieValue(headers, cookieName());
  if (token) await ddb().send(new DeleteCommand({ TableName: table(), Key: { pk: `SESSION#${hash(token)}`, sk: "METADATA" } }));
  return response(200, { signedOut: true }, { "content-type": "application/json" }, [clearCookie(cookieName()), clearCookie(stateCookieName())]);
}
export async function handler(event: any) {
  const path = event.rawPath ?? "";
  try {
    if (path === "/api/auth/start") return await beginOAuth();
    if (path === "/api/auth/callback") return await finishOAuth(event);
    if (path === "/api/auth/logout")
      return await endSession(requestHeaders(event.headers ?? {}, event.cookies));
    if (path === "/api/auth/session") {
      await getSession(requestHeaders(event.headers ?? {}, event.cookies));
      return response(200, { authenticated: true }, { "content-type": "application/json" });
    }
    return response(404, { message: "Not found" });
  } catch (error) {
    return response(error instanceof AppError ? error.status : 503,
      { code: error instanceof AppError ? error.code : "AUTH_UNAVAILABLE", message: error instanceof AppError ? error.message : "Authentication is temporarily unavailable." },
      { "content-type": "application/json" });
  }
}
