import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Tauri expects a fixed port and readable server output.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  // Every WREN_* build variable lands in the client bundle — never name a
  // secret WREN_*. The official OAuth client id is public by design.
  envPrefix: ["VITE_", "TAURI_", "WREN_"],
});
