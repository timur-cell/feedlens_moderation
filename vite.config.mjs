import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  cacheDir: "/tmp/vite-cache-feedlens",
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/image-proxy": "http://localhost:3000",
    },
  },
  build: {
    write: true,
  },
});
