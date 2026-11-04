import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
await build({
  entryPoints: [
    resolve(projectRoot, "service/handler.ts"),
    resolve(projectRoot, "service/authorizer.ts"),
  ],
  outdir: resolve(projectRoot, "dist/service"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  sourcemap: true,
});
