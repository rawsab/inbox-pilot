import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/oauth": "http://localhost:3000",
      "/reviews": "http://localhost:3000",
      "/settings": "http://localhost:3000",
      "/status": "http://localhost:3000",
      "/parser": "http://localhost:3000",
      "/internal": "http://localhost:3000",
      "/labels": "http://localhost:3000",
    },
  },
});
