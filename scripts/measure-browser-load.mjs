import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'base-url': { type: 'string', default: 'http://127.0.0.1:3001/' },
  'output-dir': { type: 'string', default: 'artifacts/performance/browser' },
  'playwright-module': { type: 'string' },
} });
const { chromium } = values['playwright-module']
  ? await import(pathToFileURL(path.resolve(values['playwright-module'])).href)
  : await import('playwright');
const outputDir = path.resolve(values['output-dir']);
await mkdir(outputDir, { recursive: true });
const harPath = path.join(outputDir, 'first-screen.har');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordHar: { path: harPath, mode: 'full', content: 'omit' },
  serviceWorkers: 'block',
});
const page = await context.newPage();
const errors = [];
const failedRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
const started = performance.now();
let observation;
try {
  await page.goto(values['base-url'], { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('region', { name: 'Map', exact: true }).waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  observation = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
    resourceTimings: performance.getEntriesByType('resource').map(entry => entry.toJSON()),
    text: document.body.innerText,
  }));
  await page.screenshot({ path: path.join(outputDir, 'first-screen.png') });
} finally {
  await context.close();
  await browser.close();
}
const har = JSON.parse(await readFile(harPath, 'utf8'));
const resourceTimingsByUrl = new Map();
for (const timing of observation.resourceTimings) {
  const timings = resourceTimingsByUrl.get(timing.name) ?? [];
  timings.push(timing);
  resourceTimingsByUrl.set(timing.name, timings);
}
const entries = har.log.entries.map(entry => {
  const resourceTiming = resourceTimingsByUrl.get(entry.request.url)?.shift() ?? null;
  const requestDestination = entry.request.headers.find(header => header.name.toLowerCase() === 'sec-fetch-dest')?.value ?? null;
  const conditionalRequest = entry.request.headers.some(header => ['if-none-match', 'if-modified-since'].includes(header.name.toLowerCase()));
  const harTransferBytes = entry.response._transferSize ?? Math.max(0, entry.response.bodySize) + Math.max(0, entry.response.headersSize);
  const missingWorkerBody = requestDestination === 'worker'
    && entry.response.status === 200
    && entry.response.bodySize === 0
    && !conditionalRequest
    && resourceTiming?.encodedBodySize > 0
    && resourceTiming.transferSize > 0
    && resourceTiming.deliveryType !== 'cache';
  const transferCorrectionBytes = missingWorkerBody ? resourceTiming.encodedBodySize : 0;
  return {
    url: entry.request.url,
    method: entry.request.method,
    status: entry.response.status,
    requestDestination,
    harTransferBytes,
    transferBytes: harTransferBytes + transferCorrectionBytes,
    transferCorrectionBytes,
    transferCorrectionSource: missingWorkerBody ? 'ResourceTiming.encodedBodySize for uncached worker body omitted by HAR' : null,
    bodyBytes: entry.response.bodySize,
    contentBytes: entry.response.content.size,
    resourceTiming,
    durationMs: entry.time,
    contentEncoding: entry.response.headers.find(header => header.name.toLowerCase() === 'content-encoding')?.value ?? null,
    cacheControl: entry.response.headers.find(header => header.name.toLowerCase() === 'cache-control')?.value ?? null,
  };
});
const countByUrl = new Map();
for (const entry of entries) countByUrl.set(entry.url, (countByUrl.get(entry.url) ?? 0) + 1);
const total = records => ({
  requests: records.length,
  harTransferBytes: records.reduce((sum, entry) => sum + Math.max(0, entry.harTransferBytes), 0),
  transferCorrectionBytes: records.reduce((sum, entry) => sum + entry.transferCorrectionBytes, 0),
  transferBytes: records.reduce((sum, entry) => sum + Math.max(0, entry.transferBytes), 0),
});
const report = {
  measuredAt: new Date().toISOString(),
  method: 'Fresh headless Chrome context, 1440x900, default URL, no cache/storage, initial guide unchanged; wait for network idle + 2 seconds + idle. transferBytes includes HAR response headers and bodies, plus ResourceTiming.encodedBodySize only for uncached worker bodies omitted by HAR. Raw HAR totals and per-entry values are retained; cached or conditional requests receive no correction. ResourceTiming.transferSize is not summed because its header bytes are estimated.',
  elapsedMs: Math.round(performance.now() - started),
  ...total(entries),
  boundaries: total(entries.filter(entry => new URL(entry.url).pathname.startsWith('/data/boundaries/'))),
  local: total(entries.filter(entry => new URL(entry.url).origin === new URL(values['base-url']).origin)),
  duplicates: [...countByUrl].filter(([, count]) => count > 1).map(([url, count]) => ({ url, count })),
  errors, failedRequests, observation, entries,
};
await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outputDir, requests: report.requests, transferBytes: report.transferBytes, boundaries: report.boundaries, errors, failedRequests }, null, 2));
