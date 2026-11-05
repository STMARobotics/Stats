import { OAuth2Client } from "google-auth-library";
import { createHash } from "node:crypto";
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
async function rosterStudent(repo: Repository, { sub, email }: Principal) {
  const rosterEmail = email.toLowerCase();
  const hash = createHash("sha256").update(rosterEmail).digest("hex");
  const claim = await repo.get(`ROSTER_EMAIL#${hash}`, "METADATA");
  if (claim?.retired || typeof claim?.memberId !== "string" || !claim.memberId)
    return null;

  const { memberId } = claim;
  const [member, login, binding] = await Promise.all([
    repo.get(`MEMBER#${memberId}`, "METADATA"),
    repo.get(`ROSTER_LOGIN#${memberId}`, "METADATA"),
    repo.get(`BINDING#${memberId}`, "METADATA"),
  ]);
  // Puncher pins the verified Google subject on the student's first roster login.
  if (
    login?.sub !== sub ||
    (binding && binding.googleSub !== sub) ||
    member?.memberId !== memberId ||
    member.csvEmail !== rosterEmail ||
    (member.directoryUserId && member.directoryUserId !== sub)
  )
    return null;
  const student = readMember(member);
  return student.active && student.memberKind === "student" ? student : null;
}
export async function resolveViewer(
  repo: Repository,
  principal: Principal,
): Promise<Viewer> {
  const raw = await repo.get(`IDENTITY#${principal.sub}`, "METADATA");
  if (raw) {
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
  }
  let member: Member | null = null;
  if (raw?.memberId) {
    const linked = await repo.get(`MEMBER#${raw.memberId}`, "METADATA");
    if (linked) member = readMember(linked);
  } else {
    member = await rosterStudent(repo, principal);
  }
  const student = member?.active === true && member.memberKind === "student";
  const staff = raw
    ? raw.roles.includes("stats:staff") ||
      (raw.roles.includes("mentor") &&
        (!raw.memberId || member?.active === true))
    : false;
  return { member, staff, student };
}
