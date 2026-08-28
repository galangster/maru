import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Engine tests run in plain Node: no DOM, no Tauri. The Platform seam is
// implemented by tests/helpers/node-platform.ts (better-sqlite3 + stub fetch).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
