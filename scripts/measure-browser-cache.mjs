import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'base-url': { type: 'string', default: 'http://127.0.0.1:3001/' },
  'output-dir': { type: 'string', default: 'artifacts/performance/browser-cache' },
  'playwright-module': { type: 'string' },
  'expect-versioned-cache': { type: 'boolean', default: false },
} });
const { chromium } = values['playwright-module']
  ? await import(pathToFileURL(path.resolve(values['playwright-module'])).href)
  : await import('playwright');
const outputDir = path.resolve(values['output-dir']);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
  recordHar: { path: path.join(outputDir, 'visits.har'), mode: 'full', content: 'omit' } });
const visits = [];
const errors = [];
try {
  for (let visit = 0; visit < 2; visit++) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const responses = [];
    page.on('response', response => responses.push({ url: response.url(), status: response.status(), headers: response.headers() }));
    await page.goto(values['base-url']);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.toJSON()));
    const localResources = resources.filter(entry => new URL(entry.name).origin === new URL(values['base-url']).origin);
    const data = localResources.filter(entry => new URL(entry.name).pathname.startsWith('/data/'));
    const assets = localResources.filter(entry => new URL(entry.name).pathname.startsWith('/assets/'));
    visits.push({ visit, data, assets, responses });
    if (values['expect-versioned-cache']) {
      assert.ok(data.length > 0 && assets.length > 0);
      assert.ok(data.every(entry => /^[a-f0-9]{64}$/.test(new URL(entry.name).searchParams.get('v') ?? '')));
      assert.ok(responses.filter(entry => new URL(entry.url).pathname.startsWith('/data/')).every(entry => entry.status === 200
        && entry.headers['cache-control'] === 'public, max-age=31536000, immutable'));
      if (visit === 1) assert.ok([...data, ...assets].every(entry => entry.transferSize === 0));
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  const counts = visits.map(visit => ({ visit: visit.visit, dataResources: visit.data.length,
    cachedDataResources: visit.data.filter(entry => entry.transferSize === 0).length,
    assetResources: visit.assets.length, cachedAssetResources: visit.assets.filter(entry => entry.transferSize === 0).length }));
  await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify({
    method: 'Same browser context, two new pages visiting the default URL. transferSize is used only to identify zero-byte cache reuse, not to estimate nonzero network bytes. Full HAR is retained.',
    counts, visits, errors,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ counts, errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
