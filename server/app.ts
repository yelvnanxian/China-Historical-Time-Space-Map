import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Catalog } from '../shared/types';
import { getEventDetail, getPlaceDetail, getTopicDetail, searchCatalog } from './catalog';

export function createApp(catalog: Catalog, options: { distDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', version: catalog.metadata.version });
  });
  app.get('/api/catalog', (_request, response) => {
    response.json(catalog);
  });
  app.get('/api/search', (request, response) => {
    const query = request.query.q;
    if (query !== undefined && (typeof query !== 'string' || query.length > 80)) {
      response.status(400).json({ error: { code: 'INVALID_QUERY', message: '搜索词应为不超过 80 个字符的文本。' } });
      return;
    }
    response.json(searchCatalog(catalog, query ?? ''));
  });
  app.get('/api/places/:id', (request, response) => {
    const detail = getPlaceDetail(catalog, request.params.id);
    if (!detail) {
      response.status(404).json({ error: { code: 'PLACE_NOT_FOUND', message: '未找到该历史地点。' } });
      return;
    }
    response.json(detail);
  });
  app.get('/api/events/:id', (request, response) => {
    const detail = getEventDetail(catalog, request.params.id);
    if (!detail) {
      response.status(404).json({ error: { code: 'EVENT_NOT_FOUND', message: '未找到该历史事件。' } });
      return;
    }
    response.json(detail);
  });
  app.get('/api/topics/:id', (request, response) => {
    const detail = getTopicDetail(catalog, request.params.id);
    if (!detail) {
      response.status(404).json({ error: { code: 'TOPIC_NOT_FOUND', message: '未找到该历史专题。' } });
      return;
    }
    response.json(detail);
  });
  // API mistakes must not accidentally return the single-page application's HTML.
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: { code: 'API_NOT_FOUND', message: '接口不存在。' } });
  });

  if (options.distDir && existsSync(path.join(options.distDir, 'index.html'))) {
    const distDir = path.resolve(options.distDir);
    app.use(express.static(distDir));
    app.get('/{*path}', (request, response, next) => {
      if (path.extname(request.path) || !request.accepts('html')) return next();
      response.sendFile(path.join(distDir, 'index.html'));
    });
  }
  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: '页面不存在。' } });
  });
  const onError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (response.headersSent) return _next(error);
    if (error instanceof URIError) {
      response.status(400).json({ error: { code: 'INVALID_URL', message: '请求地址格式不正确。' } });
      return;
    }
    console.error('[api]', error);
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务暂时无法处理请求，请稍后重试。' } });
  };
  app.use(onError);
  return app;
}
