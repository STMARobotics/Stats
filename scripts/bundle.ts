import { build } from "esbuild";
await build({
  entryPoints: ["service/handler.ts", "service/authorizer.ts", "service/activity-projection.ts"],
  outdir: "dist/service",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  sourcemap: true,
});
