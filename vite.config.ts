/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "web",
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { outDir: "../dist/web", emptyOutDir: true },
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["tests/**/*.test.ts"] },
});
