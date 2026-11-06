import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { bearer, resolveViewer, verifyGoogle } from "../service/auth";
import { assertDemoAllowed, FixtureRepository } from "../service/fixtures";
import { productionRepository } from "../service/repository";
const audience = "stats-test.apps.googleusercontent.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const cert = publicKey.export({ type: "spki", format: "pem" }).toString();
const verifier = {
  verifyIdToken: async ({
    idToken,
    audience,
  }: {
    idToken: string;
    audience: string;
  }) =>
    new OAuth2Client().verifySignedJwtWithCertsAsync(
      idToken,
      { test: cert },
      audience,
      ["https://accounts.google.com", "accounts.google.com"],
    ),
};
const payload = () => ({
  iss: "https://accounts.google.com",
  aud: audience,
  iat: Math.floor(Date.now() / 1000) - 10,
  exp: Math.floor(Date.now() / 1000) + 3600,
  sub: "demo-alex",
  email: "alex@stmarobotics.org",
  email_verified: true,
  hd: "stmarobotics.org",
});
function jwt(p: Record<string, unknown>) {
  const data = [{ alg: "RS256", kid: "test", typ: "JWT" }, p]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".");
  return (
    data +
    "." +
    sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")
  );
}
describe("server Google boundary", () => {
  it("verifies a real RSA signature through the Google library and stable subject", async () => {
    expect(await verifyGoogle(jwt(payload()), audience, verifier)).toEqual({
      sub: "demo-alex",
      email: "alex@stmarobotics.org",
    });
  });
  it("rejects signature tampering", async () => {
    const token = jwt(payload());
    const parts = token.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({ ...payload(), sub: "someone-else" }),
    ).toString("base64url");
    await expect(
      verifyGoogle(parts.join("."), audience, verifier),
    ).rejects.toMatchObject({ status: 401 });
  });
  it.each([
    { iss: "https://evil.example" },
    { aud: "puncher.apps.googleusercontent.com" },
    { exp: 1 },
    { sub: "" },
    { email_verified: false },
    { hd: "elsewhere.org" },
    { hd: undefined },
    { email: "alex@example.com" },
  ])("rejects invalid claims %j", async (patch) => {
    await expect(
      verifyGoogle(jwt({ ...payload(), ...patch }), audience, verifier),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("requires bearer tokens and an app-specific audience", async () => {
    expect(() => bearer("demo-alex")).toThrow();
    await expect(verifyGoogle("x", undefined)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("uses the verified subject instead of matching by email", async () => {
    const repo = new FixtureRepository();
    await expect(
      resolveViewer(repo, { sub: "another-subject", email: "alex@stmarobotics.org" }),
    ).resolves.toEqual({ member: null, student: false, staff: false });
    await expect(
      resolveViewer(repo, { sub: "demo-alex", email: "alex.renamed@stmarobotics.org" }),
    ).resolves.toMatchObject({ student: true, staff: false });
  });
  it("cannot enable demo auth/fixtures in deployed or production runtimes", () => {
    for (const env of [
      { AWS_LAMBDA_FUNCTION_NAME: "stats" },
      { STATS_ENV: "production" },
      { NODE_ENV: "production" },
    ])
      expect(() => assertDemoAllowed(env)).toThrow();
    expect(() =>
      productionRepository({
        TABLE_NAME: "source",
        SOURCE_REGION: "us-east-2",
        DATA_MODE: "dynamo-local",
        AWS_LAMBDA_FUNCTION_NAME: "stats",
        DYNAMODB_ENDPOINT: "http://localhost:8000",
      }),
    ).toThrow();
    expect(() => productionRepository({})).toThrow(/no fixture fallback/);
    expect(() =>
      productionRepository({
        TABLE_NAME: "source",
        SOURCE_REGION: "us-east-2",
        DATA_MODE: "cloud",
      }),
    ).toThrow(/CONFIRMED/);
  });
});
