import { getSession as sessionPrincipal } from "./session";
export async function handler(event: any) {
  try {
    const principal = await sessionPrincipal(event.headers ?? {});
    return { isAuthorized: true, context: { sub: principal.sub } };
  } catch {
    return { isAuthorized: false };
  }
}
