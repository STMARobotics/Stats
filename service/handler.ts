import { getSession as sessionPrincipal } from "./session";
import { createApi, respond } from "./api";
import { AppError } from "./domain";
import { productionRepository } from "./repository";
let api: ReturnType<typeof createApi>;
export async function handler(event: any) {
  try {
    // Verify again so direct invocation and the local adapter share the same boundary.
    const principal = await sessionPrincipal(event.headers ?? {});
    api ??= createApi(productionRepository());
    return api({
      method: event.requestContext?.http?.method ?? "",
      path: event.rawPath ?? "",
      query: event.queryStringParameters ?? {},
      principal,
    });
  } catch (e) {
    if (e instanceof AppError)
      return respond(e.status, { code: e.code, message: e.message });
    console.error(JSON.stringify({ event: "configuration_or_source_error" }));
    return respond(503, {
      code: "DATA_UNAVAILABLE",
      message: "Stats source configuration or data is unavailable.",
    });
  }
}
