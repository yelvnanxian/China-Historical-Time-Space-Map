import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';

const { values } = parseArgs({ options: {
  'base-url': { type: 'string', default: 'http://127.0.0.1:3001/' },
  'output-dir': { type: 'string', default: 'artifacts/performance/tang-detail-browser' },
  'playwright-module': { type: 'string' },
} });
const { chromium } = values['playwright-module']
  ? await import(pathToFileURL(path.resolve(values['playwright-module'])).href)
  : await import('playwright');
const outputDir = path.resolve(values['output-dir']);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordHar: { path: path.join(outputDir, 'tang-detail.har'), mode: 'full', content: 'omit' },
});
const page = await context.newPage();
const errors = [];
const gzipChecks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  const pathname = new URL(response.url()).pathname;
  if (!pathname.startsWith('/data/tang-detail/') || !pathname.endsWith('.geojson.gz')) return;
  gzipChecks.push((async () => {
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['content-encoding'], undefined);
    const bytes = await response.body();
    assert.deepEqual([...bytes.subarray(0, 2)], [0x1f, 0x8b]);
    assert.deepEqual(bytes, await readFile(path.join('dist', pathname.slice(1))));
    const collection = JSON.parse(gunzipSync(bytes));
    assert.equal(collection.type, 'FeatureCollection');
    assert.ok(collection.features.length > 0);
    return { url: pathname, bytes: bytes.length, featureCount: collection.features.length, contentEncoding: null };
  })().catch(error => ({ error: error.message, url: pathname })));
});
try {
  await page.goto(new URL('/?period=tang&place=changan', values['base-url']).href);
  await page.getByRole('button', { name: '跳过使用引导' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: '在地图中定位此地' }).click();
  await page.waitForTimeout(2000);
  for (let step = 0; step < 3; step++) {
    await page.getByRole('button', { name: '放大地图', exact: true }).click();
    await page.waitForTimeout(600);
  }
  await page.waitForLoadState('networkidle');
  const labels = page.locator('.tang-detail-label');
  await labels.filter({ hasText: /^浐河$/ }).first().click();
  const detail = page.getByRole('region', { name: '河湖与山峰详情', exact: true });
  await detail.waitFor();
  const detailText = await detail.innerText();
  assert.match(detailText, /浐河/);
  assert.match(detailText, /现代/);
  assert.ok(!await page.getByText('部分河湖细节未能加载', { exact: false }).count());
  const mapStatus = await page.getByRole('button', { name: '查看当前地图层级与数据范围' }).innerText();
  const visibleLabels = await labels.allTextContents();
  await page.screenshot({ path: path.join(outputDir, 'tang-detail.png') });
  const gzipFiles = await Promise.all(gzipChecks);
  assert.ok(gzipFiles.length > 0);
  assert.ok(gzipFiles.every(file => !file.error), JSON.stringify(gzipFiles));
  assert.deepEqual(errors, []);
  const result = { url: page.url(), mapStatus, visibleLabels, detailText, gzipFiles, errors };
  await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
}
