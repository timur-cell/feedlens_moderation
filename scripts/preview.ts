import { preview } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";

const server = await preview({
  configFile: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  cacheDir: "/tmp/vite-cache-feedlens",
  build: {
    outDir: "dist",
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});

server.printUrls();
