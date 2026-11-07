import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { build } from "vite";
import { createApp } from "../server/app";
import { exampleCatalog } from "../server/fixtures";
import { dataVersionsPlugin } from "./data-versions";

interface ClientState {
  year: number;
  sampleUrl: string;
  unchangedUrl: string;
  sampleStatus: number;
  unchangedStatus: number;
  sampleCacheControl: string | null;
  unchangedCacheControl: string | null;
  versions: Record<string, string>;
}

interface WireRequest {
  phase: string;
  url: string;
  status: number;
  cacheControl: string;
  requestCacheControl?: string;
  ifNoneMatch?: string;
}

interface ResourceTiming {
  name: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
}

const { values } = parseArgs({ options: {
  "playwright-module": { type: "string" },
  "output-dir": { type: "string", default: "artifacts/performance/data-version-browser" },
} });
const playwrightModule = values["playwright-module"]
  ? pathToFileURL(path.resolve(values["playwright-module"])).href : "playwright";
const { chromium } = await import(playwrightModule);
const outputDirectory = path.resolve(values["output-dir"]!);
await mkdir(outputDirectory, { recursive: true });
const fixtureDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "atlas-data-version-browser-")));
const dataDirectory = path.join(fixtureDirectory, "public/data");
const distDirectory = path.join(fixtureDirectory, "dist");
const helperPath = fileURLToPath(new URL("../src/lib/resource-url.ts", import.meta.url));
const helperSource = await readFile(helperPath);
const harPath = path.join(outputDirectory, "data-version.har");
const wireRequests: WireRequest[] = [];
const errors: string[] = [];
const failedRequests: { url: string; error: string | undefined }[] = [];
let phase = "initial";
let server: Server | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>>;
let context: Awaited<ReturnType<typeof browser.newContext>>;
let failure: unknown;
let result: Record<string, unknown> = {};

async function startServer(port: number): Promise<number> {
  const app = createApp(exampleCatalog(), { distDir: distDirectory });
  const listening = createServer((request, response) => {
    const requestPhase = phase;
    response.once("finish", () => wireRequests.push({
      phase: requestPhase,
      url: request.url ?? "",
      status: response.statusCode,
      cacheControl: String(response.getHeader("cache-control") ?? ""),
      requestCacheControl: request.headers["cache-control"],
      ifNoneMatch: request.headers["if-none-match"],
    }));
    app(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    listening.once("error", reject);
    listening.listen(port, "127.0.0.1", () => {
      listening.off("error", reject);
      resolve();
    });
  });
  server = listening;
  const address = listening.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}

async function stopServer() {
  if (!server) return;
  const closing = server;
  server = undefined;
  const stopped = new Promise<void>((resolve, reject) => closing.close(error => error ? reject(error) : resolve()));
  closing.closeAllConnections();
  await stopped;
}

async function compileFixture() {
  await build({
    root: fixtureDirectory,
    configFile: false,
    plugins: [dataVersionsPlugin()],
    logLevel: "silent",
    build: { emptyOutDir: true },
  });
  return JSON.parse(await readFile(path.join(distDirectory, "content-versions.json"), "utf8")) as Record<string, string>;
}

async function observePage(url: string, expectedYear: number, label: string) {
  const page = await context.newPage();
  page.on("pageerror", (error: Error) => errors.push(error.message));
  page.on("requestfailed", (request: { url(): string; failure(): { errorText: string } | null }) => {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
  });
  const navigation = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  assert.ok(navigation);
  assert.equal(navigation.status(), 200);
  await page.waitForFunction("document.getElementById('status').dataset.state !== 'loading'", undefined, { timeout: 30000 });
  const state = await page.evaluate("window.fixtureState") as ClientState | undefined;
  assert.ok(state, await page.locator("#status").innerText());
  assert.equal(state.year, expectedYear);
  assert.equal(await page.locator("#year").innerText(), String(expectedYear));
  assert.equal(state.sampleStatus, 200);
  assert.equal(state.unchangedStatus, 200);
  assert.match(state.sampleCacheControl ?? "", /max-age=31536000/);
  assert.match(state.sampleCacheControl ?? "", /immutable/);
  assert.match(state.unchangedCacheControl ?? "", /immutable/);
  const htmlHeaders = await navigation.allHeaders() as Record<string, string>;
  assert.match(htmlHeaders["cache-control"], /no-cache/);
  const scriptUrl = await page.locator('script[type="module"][src]').getAttribute("src") as string | null;
  assert.ok(scriptUrl);
  const resourceTimings = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.toJSON())) as ResourceTiming[];
  await page.screenshot({ path: path.join(outputDirectory, `${label}.png`) });
  return { page, observation: { state, htmlHeaders, scriptUrl, resourceTimings } };
}

try {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(path.join(fixtureDirectory, "resource-url.ts"), helperSource);
  await writeFile(path.join(dataDirectory, "sample.json"), JSON.stringify({ year: 741 }) + "\n");
  await writeFile(path.join(dataDirectory, "unchanged.json"), JSON.stringify({ name: "Unchanged reference" }) + "\n");
  await writeFile(path.join(fixtureDirectory, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Data version cache regression</title>
<style>body{margin:72px;font:20px system-ui;background:#f5f2ea;color:#24382e}main{max-width:850px;padding:36px;border:1px solid #b2b9ae;border-radius:16px;background:white}h1{font-size:28px}output{display:block;font-size:72px;margin:24px 0}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}</style></head>
<body><main><h1>Data version cache regression</h1><p>Loaded sample year</p><output id="year">Loading</output><p id="status" data-state="loading">Loading versioned data</p><pre id="urls"></pre></main><script type="module" src="/main.ts"></script></body></html>\n`);
  await writeFile(path.join(fixtureDirectory, "main.ts"), `import versions from "virtual:content-versions";
import { configureResourceVersions, fetchResource, resourceUrl } from "./resource-url";
configureResourceVersions(versions);
async function load() {
  const sampleUrl = resourceUrl("/data/sample.json");
  const unchangedUrl = resourceUrl("/data/unchanged.json");
  const [sampleResponse, unchangedResponse] = await Promise.all([fetchResource("/data/sample.json"), fetchResource("/data/unchanged.json")]);
  if (!sampleResponse.ok || !unchangedResponse.ok) throw new Error("Versioned fixture response failed");
  const sample = await sampleResponse.json();
  await unchangedResponse.json();
  Object.assign(window, { fixtureState: { year: sample.year, sampleUrl, unchangedUrl, versions,
    sampleStatus: sampleResponse.status, unchangedStatus: unchangedResponse.status,
    sampleCacheControl: sampleResponse.headers.get("cache-control"), unchangedCacheControl: unchangedResponse.headers.get("cache-control") } });
  document.getElementById("year").textContent = String(sample.year);
  document.getElementById("urls").textContent = sampleUrl + "\\n" + unchangedUrl;
  document.getElementById("status").textContent = "Loaded using the real resource URL helper";
  document.getElementById("status").dataset.state = "ready";
}
load().catch(error => { document.getElementById("status").textContent = error.message; document.getElementById("status").dataset.state = "error"; });\n`);
  const initialVersions = await compileFixture();
  const port = await startServer(0);
  const url = `http://127.0.0.1:${port}/`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({
    viewport: { width: 1100, height: 760 },
    recordHar: { path: harPath, mode: "full", content: "embed" },
    serviceWorkers: "block",
  });
  const initial = await observePage(url, 741, "before");
  assert.equal(new URL(initial.observation.state.sampleUrl, url).searchParams.get("v"), initialVersions["/data/sample.json"]);
  await initial.page.close();
  await stopServer();
  await writeFile(path.join(dataDirectory, "sample.json"), JSON.stringify({ year: 755 }) + "\n");
  const updatedVersions = await compileFixture();
  assert.notEqual(updatedVersions["/data/sample.json"], initialVersions["/data/sample.json"]);
  assert.equal(updatedVersions["/data/unchanged.json"], initialVersions["/data/unchanged.json"]);
  phase = "updated";
  assert.equal(await startServer(port), port);
  const updated = await observePage(url, 755, "after");
  assert.notEqual(updated.observation.scriptUrl, initial.observation.scriptUrl);
  assert.notEqual(updated.observation.state.sampleUrl, initial.observation.state.sampleUrl);
  assert.equal(updated.observation.state.unchangedUrl, initial.observation.state.unchangedUrl);
  assert.equal(new URL(updated.observation.state.sampleUrl, url).searchParams.get("v"), updatedVersions["/data/sample.json"]);
  const unchangedTiming = updated.observation.resourceTimings.find(entry => entry.name === new URL(updated.observation.state.unchangedUrl, url).href);
  assert.ok(unchangedTiming);
  assert.equal(unchangedTiming.transferSize, 0, "Unchanged immutable data should remain in the same browser context cache");
  assert.ok(unchangedTiming.decodedBodySize > 0);
  assert.equal(wireRequests.filter(request => request.phase === "updated" && request.url === updated.observation.state.unchangedUrl).length, 0);
  phase = "stale-version";
  const stale = await updated.page.evaluate(async (oldUrl: string) => {
    const response = await fetch(oldUrl, { cache: "reload" });
    return { url: response.url, status: response.status, cacheControl: response.headers.get("cache-control"), body: await response.text() };
  }, initial.observation.state.sampleUrl) as { url: string; status: number; cacheControl: string | null; body: string };
  assert.equal(stale.status, 410);
  assert.equal(stale.cacheControl, "no-store");
  assert.ok(wireRequests.some(request => request.phase === "stale-version" && request.url === initial.observation.state.sampleUrl && request.status === 410));
  await updated.page.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  result = {
    url,
    method: "Two temporary Vite production builds served on the same ephemeral localhost port using createApp; one Chrome context retains its HTTP cache between pages. The real resource-url.ts is copied verbatim. Only temporary fixture data changes.",
    helperSha256: createHash("sha256").update(helperSource).digest("hex"),
    initialVersions,
    updatedVersions,
    initial: initial.observation,
    updated: updated.observation,
    stale,
    unchangedCacheReused: true,
  };
} catch (error) {
  failure = error;
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  await stopServer();
  await rm(fixtureDirectory, { recursive: true, force: true });
}

const report = {
  ...result,
  passed: !failure,
  error: failure instanceof Error ? failure.message : failure === undefined ? null : String(failure),
  errors,
  failedRequests,
  wireRequests,
  artifacts: { har: harPath, before: path.join(outputDirectory, "before.png"), after: path.join(outputDirectory, "after.png") },
};
await writeFile(path.join(outputDirectory, "summary.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (failure) throw failure;
