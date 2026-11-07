import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dataVersionsPlugin } from "./scripts/data-versions";
export default defineConfig({
  plugins: [react(), dataVersionsPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
