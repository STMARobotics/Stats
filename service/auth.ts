import { OAuth2Client } from "google-auth-library";
import { AppError, badData, readMember, type Member } from "./domain";
import type { Repository } from "./repository";

export type Principal = { sub: string; email: string };
export type Viewer = {
  member: Member | null;
  staff: boolean;
  student: boolean;
};
export type TokenVerifier = {
  verifyIdToken(options: {
    idToken: string;
    audience: string;
  }): Promise<{ getPayload(): any }>;
};
const client = new OAuth2Client();
export function bearer(header?: string) {
  const match = header?.match(/^Bearer (\S+)$/i);
  if (!match)
    throw new AppError(
      401,
      "LOGIN_REQUIRED",
      "Sign in again with your STMA Robotics Google account.",
    );
  return match[1];
}
export async function verifyGoogle(
  token: string,
  audience: string | undefined,
  verifier: TokenVerifier = client,
  now = Date.now(),
): Promise<Principal> {
  if (!audience)
    throw new AppError(
      503,
      "AUTH_CONFIG",
      "Stats Google sign-in has not been configured.",
    );
  try {
    const p = (
      await verifier.verifyIdToken({ idToken: token, audience })
    ).getPayload();
    if (
      !p ||
      !["accounts.google.com", "https://accounts.google.com"].includes(p.iss) ||
      p.aud !== audience ||
      !Number.isFinite(p.exp) ||
      p.exp * 1000 <= now ||
      !p.sub ||
      typeof p.sub !== "string" ||
      p.email_verified !== true ||
      p.hd !== "stmarobotics.org" ||
      typeof p.email !== "string" ||
      !p.email.toLowerCase().endsWith("@stmarobotics.org")
    )
      throw new Error();
    return { sub: p.sub, email: p.email };
  } catch {
    throw new AppError(
      401,
      "LOGIN_EXPIRED",
      "Your sign-in expired or is invalid. Sign in with your STMA Robotics Google account.",
    );
  }
}
export async function resolveViewer(
  repo: Repository,
  principal: Principal,
): Promise<Viewer> {
  const raw = await repo.get(`USER#${principal.sub}`, "METADATA");
  if (!raw) return { member: null, staff: false, student: false };
  const member = readMember(raw);
  if (member.memberId !== principal.sub) throw badData();
  if (!member.active)
    throw new AppError(
      403,
      "ACCOUNT_DISABLED",
      "This account is disabled in Puncher. Ask a Puncher admin to review it.",
    );
  return {
    member,
    student: member.role === "STUDENT",
    staff: member.role === "MENTOR" || member.role === "ADMIN",
  };
}
