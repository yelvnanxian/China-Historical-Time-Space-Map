import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'base-url': { type: 'string', default: 'http://127.0.0.1:3001/' },
  'output-dir': { type: 'string', default: 'artifacts/performance/boundary-browser' },
  'playwright-module': { type: 'string' },
} });
const { chromium } = values['playwright-module']
  ? await import(pathToFileURL(path.resolve(values['playwright-module'])).href)
  : await import('playwright');
const outputDir = path.resolve(values['output-dir']);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
  recordHar: { path: path.join(outputDir, 'regression.har'), mode: 'full', content: 'omit' } });
const page = await context.newPage();
const errors = [];
const requests = [];
const checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => requests.push(new URL(request.url()).pathname));
const settle = async () => {
  await page.waitForLoadState('networkidle', { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.waitForLoadState('networkidle', { timeout: 60000 });
};
const toolButton = () => page.getByRole('button', { name: '地图工具', exact: true });
async function openBoundaryTools() {
  if (await toolButton().getAttribute('aria-expanded') !== 'true') await toolButton().click();
  const heading = page.locator('.boundary-controls-heading');
  if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
}
async function search(query) {
  await openBoundaryTools();
  await page.getByRole('searchbox', { name: '查找当前资料中的行政区' }).fill(query);
  const results = page.getByRole('region', { name: '行政区搜索结果' });
  await results.getByRole('button').first().waitFor();
  return results;
}
async function expectSelection(name) {
  await page.locator('.boundary-selection h3').filter({ hasText: name }).waitFor({ timeout: 60000 });
  await settle();
  assert.ok((await page.locator('.boundary-selection h3').innerText()).includes(name));
}
try {
  await page.goto(values['base-url']);
  await page.getByRole('button', { name: '跳过使用引导' }).click();
  await settle();
  const initialLayers = requests.filter(url => /\/boundaries\/.*\.geojson$/.test(url));
  assert.deepEqual(initialLayers.sort(), ['/data/boundaries/hartwell-741-country.geojson', '/data/boundaries/hartwell-741-province.geojson']);
  checks.push({ name: '默认只加载实际可见国家和省道', layers: initialLayers });
  const results = await search('蓝田');
  assert.ok((await results.innerText()).includes('蓝田县'));
  assert.ok(!requests.includes('/data/boundaries/hartwell-741-county.geojson'));
  await results.getByRole('button', { name: /^蓝田县/ }).click();
  await expectSelection('蓝田县');
  assert.equal(requests.filter(url => url === '/data/boundaries/hartwell-741-county.geojson').length, 1);
  checks.push({ name: '未加载县仍可搜索，点击后加载并选中', selection: await page.locator('.boundary-selection h3').innerText() });
  const hierarchy = page.getByRole('region', { name: '上下级行政区' });
  await hierarchy.getByRole('button', { name: /^京兆府/ }).click();
  await expectSelection('京兆府');
  await page.getByRole('region', { name: '上下级行政区' }).getByRole('button', { name: '蓝田县', exact: true }).click();
  await expectSelection('蓝田县');
  checks.push({ name: '县跳府、府列下辖县并跳回', countyRequests: requests.filter(url => url === '/data/boundaries/hartwell-741-county.geojson').length });
  const modern = await search('西安市');
  assert.ok((await modern.innerText()).includes('西安市'));
  checks.push({ name: '现代地名搜索保留全部层级', results: await modern.innerText() });
  await page.getByRole('searchbox', { name: '查找当前资料中的行政区' }).fill('');
  for (let zoom = 0; zoom < 2; zoom++) {
    await page.getByRole('button', { name: '放大地图', exact: true }).click();
    await page.waitForTimeout(500);
  }
  await settle();
  assert.equal(requests.filter(url => url === '/data/boundaries/hartwell-741-county.geojson').length, 1);
  await page.screenshot({ path: path.join(outputDir, 'tang-county.png') });
  await page.getByRole('combobox', { name: '选择朝代截面' }).selectOption('song');
  await settle();
  await openBoundaryTools();
  await page.getByRole('combobox', { name: '选择历史边界资料年份' }).selectOption('hartwell-1080');
  await settle();
  assert.equal(await page.getByRole('combobox', { name: '选择历史边界资料年份' }).inputValue(), 'hartwell-1080');
  await page.getByRole('combobox', { name: '选择历史边界资料年份' }).selectOption('hartwell-1200');
  await settle();
  assert.equal(await page.getByRole('combobox', { name: '选择历史边界资料年份' }).inputValue(), 'hartwell-1200');
  checks.push({ name: '切换朝代及1080、1200资料年', url: page.url() });
  await page.getByRole('button', { name: '边界对比', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await settle();
  assert.equal(await page.locator('.boundary-comparison-pane canvas').count(), 2);
  assert.equal(await page.locator('.boundary-comparison-error:visible').count(), 0);
  checks.push({ name: '双时期比较保持两张地图正常显示' });
  await page.screenshot({ path: path.join(outputDir, 'comparison.png') });
  await page.getByRole('button', { name: '关闭边界对比', exact: true }).click();
  for (const [period, place, regionName, expected] of [
    ['tang', 'changan', null, '京兆府'],
    ['song', 'hangzhou', '宋代同期建置参考范围', '临安府'],
    ['ming', 'hangzhou', '明代相关建置范围', '杭州府'],
  ]) {
    await page.goto(new URL(`/?period=${period}&place=${place}`, values['base-url']).href);
    await settle();
    const jump = regionName
      ? page.getByRole('region', { name: regionName }).getByRole('button').first()
      : page.getByRole('button', { name: /查看京兆府完整辖区/ });
    await jump.click();
    await expectSelection(expected);
    checks.push({ name: `${period}城池辖区面板跳转`, selection: await page.locator('.boundary-selection h3').innerText() });
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify({ checks, errors, requests }, null, 2) + '\n');
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
