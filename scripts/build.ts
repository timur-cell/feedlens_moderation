import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";

await build({
  configFile: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  cacheDir: "/tmp/vite-cache-feedlens",
  build: {
    write: true,
    outDir: "dist",
  },
  root: process.cwd(),
});

console.log("Build OK");
