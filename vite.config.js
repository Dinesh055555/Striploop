import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  css: { postcss: path.join(root, "postcss.config.js") },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
});
