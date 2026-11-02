import { createServer } from "node:http";
import { createApi, respond } from "./api";
import { AppError } from "./domain";
import { bearer, verifyGoogle } from "./auth";
import { productionRepository } from "./repository";
import { assertDemoAllowed, demoNow, FixtureRepository } from "./fixtures";
const demo = process.argv.includes("--demo");
if (demo) assertDemoAllowed();
const repo = demo ? new FixtureRepository() : productionRepository();
const api = createApi(repo, demo ? () => demoNow : undefined);
createServer(async (req, res) => {
  let result;
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/config.json" && req.method === "GET")
      result = respond(200, {
        googleClientId: demo ? "" : (process.env.GOOGLE_CLIENT_ID ?? ""),
        allowedDomain: "stmarobotics.org",
        demo,
        ...(demo ? { demoNow } : {}),
      });
    else {
      const token = bearer(req.headers.authorization);
      let principal;
      if (demo) {
        if (!/^demo-(alex|jordan|mentor|casey|unlinked)$/.test(token))
          throw new AppError(
            401,
            "LOGIN_REQUIRED",
            "Choose a synthetic demo account.",
          );
        principal = { sub: token, email: `${token.slice(5)}@stmarobotics.org` };
      } else
        principal = await verifyGoogle(token, process.env.GOOGLE_CLIENT_ID);
      result = await api({
        method: req.method ?? "",
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        principal,
      });
    }
  } catch (e) {
    result =
      e instanceof AppError
        ? respond(e.status, { code: e.code, message: e.message })
        : respond(503, {
            code: "DATA_UNAVAILABLE",
            message: "Local API configuration or data unavailable.",
          });
  }
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
}).listen(3100, "127.0.0.1", () =>
  console.log(
    `Stats API http://127.0.0.1:3100 (${demo ? "SYNTHETIC DEMO; clock fixed at " + demoNow : "explicit development database; real Google authentication"})`,
  ),
);
