import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { salamDbPlugin } from "./db/vite-plugin.mjs";

export default defineConfig({
  plugins: [react(), salamDbPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    watch: {
      ignored: ["**/Salam-Residences.html", "**/dist/**", "**/data/**"],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
