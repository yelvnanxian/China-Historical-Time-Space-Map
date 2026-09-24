import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from './app';
import { loadCatalog } from './catalog';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 3001);

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1 至 65535 之间的整数。');
  }
  const catalog = await loadCatalog(path.join(rootDir, 'data/catalog.json'));
  const app = createApp(catalog, { distDir: path.join(rootDir, 'dist') });
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`历史时空地图 API 已启动：http://127.0.0.1:${port}`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请通过 PORT 指定其他端口。` : error.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
} catch (error) {
  console.error('服务启动失败：', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
