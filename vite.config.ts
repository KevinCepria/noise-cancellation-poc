import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  server: {
    headers: {
      // Set the Cross-Origin-Opener-Policy (COOP)
      "Cross-Origin-Opener-Policy": "same-origin",

      // Set the Cross-Origin-Embedder-Policy (COEP)
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [react()],
});
