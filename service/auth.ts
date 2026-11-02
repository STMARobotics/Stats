import { OAuth2Client } from "google-auth-library";
import { AppError, readMember, validate, type Member } from "./domain";
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
  const raw = await repo.get(`IDENTITY#${principal.sub}`, "METADATA");
  if (!raw)
    throw new AppError(
      403,
      "ACCOUNT_SETUP",
      "This Google account is not linked or approved. Ask the team administrator to set up access in Puncher.",
    );
  validate(raw, "identity");
  if (
    raw.googleSub !== principal.sub ||
    raw.pk !== `IDENTITY#${principal.sub}` ||
    raw.email.toLowerCase() !== principal.email.toLowerCase() ||
    !raw.enabled
  )
    throw new AppError(
      403,
      "ACCOUNT_DISABLED",
      "This account is disabled or needs its identity mapping reviewed in Puncher.",
    );
  const staff = raw.roles.includes("stats:staff"),
    student = raw.roles.includes("stats:student");
  let member: Member | null = null;
  if (raw.memberId) {
    const linked = await repo.get(`MEMBER#${raw.memberId}`, "METADATA");
    if (linked) member = readMember(linked);
  }
  if (
    (!student && !staff) ||
    (student && (!member || !member.active || member.memberKind !== "student"))
  )
    throw new AppError(
      403,
      "ACCOUNT_SETUP",
      "This account needs an active member link and explicit Stats permission in Puncher.",
    );
  return { member, staff, student };
}
