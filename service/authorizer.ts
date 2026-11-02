import { bearer, verifyGoogle } from "./auth";
export async function handler(event: any) {
  try {
    const principal = await verifyGoogle(
      bearer(event.headers?.authorization ?? event.headers?.Authorization),
      process.env.GOOGLE_CLIENT_ID,
    );
    return { isAuthorized: true, context: { sub: principal.sub } };
  } catch {
    return { isAuthorized: false };
  }
}
