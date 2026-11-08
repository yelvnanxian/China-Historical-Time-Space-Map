import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataVersionsPlugin } from "./scripts/data-versions";
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ command }) => {
  const stage = process.env.MAP_BUILD_STAGE_DIR;
  if (stage && (command !== 'build' || !path.isAbsolute(stage) || path.dirname(stage) !== path.join(root, 'artifacts') || !path.basename(stage).startsWith('production-build-'))) throw new Error('MAP_BUILD_STAGE_DIR 必须位于项目 artifacts/production-build-*');
  return {
    publicDir: stage ? path.join(stage, 'public') : undefined,
    build: stage ? { outDir: path.join(stage, 'dist'), emptyOutDir: true } : undefined,
    plugins: [react(), dataVersionsPlugin()],
    server: { port: 5173, strictPort: true, proxy: { "/api": "http://127.0.0.1:3001" } },
  };
});
