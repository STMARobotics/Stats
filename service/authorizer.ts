import { getSession as sessionPrincipal, requestHeaders } from "./session";
export async function handler(event: any) {
  try {
    const principal = await sessionPrincipal(
      requestHeaders(event.headers ?? {}, event.cookies),
    );
    return { isAuthorized: true, context: { sub: principal.sub } };
  } catch {
    return { isAuthorized: false };
  }
}
