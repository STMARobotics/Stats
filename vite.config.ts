import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  root: "ui",
  build: { outDir: "../dist/ui", emptyOutDir: true },
  server: {
    port: 4300,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3100",
      "/config.json": "http://127.0.0.1:3100",
    },
  },
});
