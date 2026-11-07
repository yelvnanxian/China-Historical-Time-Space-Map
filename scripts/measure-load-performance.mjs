import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const execute = promisify(execFile);
const options = { dataRoot: "public/data", distDir: "dist", baseUrl: "http://127.0.0.1:3001", output: null, inventoryOnly: false };
const optionNames = new Map([["--data-root", "dataRoot"], ["--dist-dir", "distDir"], ["--base-url", "baseUrl"], ["--output", "output"]]);

for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index];
  if (argument === "--inventory-only") {
    options.inventoryOnly = true;
  } else if (argument === "--help") {
    console.log("Usage: node scripts/measure-load-performance.mjs [--data-root public/data|dist/data] [--dist-dir dist] [--base-url http://127.0.0.1:3001] [--output report.json] [--inventory-only]");
    process.exit(0);
  } else {
    const name = optionNames.get(argument);
    const value = process.argv[++index];
    if (!name || !value || value.startsWith("--")) throw new Error(`Invalid argument: ${argument}`);
    options[name] = value;
  }
}

const dataRoot = path.resolve(root, options.dataRoot);
const distDir = path.resolve(root, options.distDir);
const baseUrl = new URL(options.baseUrl);
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.search || baseUrl.hash || baseUrl.pathname !== "/") {
  throw new Error("--base-url must be an HTTP(S) origin without a path, query, or fragment");
}

async function inventory(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push({ path: path.relative(directory, absolute).split(path.sep).join("/"), bytes: (await stat(absolute)).size });
    }
  }
  await visit(directory);
  files.sort((first, second) => first.path.localeCompare(second.path, "en"));
  const names = new Set(files.map(file => file.path));
  for (const file of files) file.precompressedVariant = /\.(br|gz)$/.test(file.path) && names.has(file.path.replace(/\.(br|gz)$/, ""));
  return files;
}

function summarize(files) {
  return {
    fileCount: files.length,
    diskBytes: files.reduce((total, file) => total + file.bytes, 0),
    originalFileCount: files.filter(file => !file.precompressedVariant).length,
    originalBytes: files.filter(file => !file.precompressedVariant).reduce((total, file) => total + file.bytes, 0),
    precompressedVariantCount: files.filter(file => file.precompressedVariant).length,
    precompressedVariantBytes: files.filter(file => file.precompressedVariant).reduce((total, file) => total + file.bytes, 0),
  };
}

function parseHeaders(raw) {
  const blocks = raw.trim().split(/\r?\n\r?\n/).filter(block => /^HTTP\//.test(block));
  const block = blocks.at(-1);
  if (!block) throw new Error("curl returned no HTTP response headers");
  const [statusLine, ...lines] = block.split(/\r?\n/);
  const headers = {};
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const name = line.slice(0, separator).toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return { statusLine, headers };
}

const [dataFiles, assetFiles] = await Promise.all([inventory(dataRoot), inventory(path.join(distDir, "assets"))]);
const byDataPath = new Map(dataFiles.map(file => [file.path, file]));
const manifest = JSON.parse(await readFile(path.join(dataRoot, "boundaries/manifest.json"), "utf8"));
const correspondence = JSON.parse(await readFile(path.join(dataRoot, "modern-correspondence.json"), "utf8"));
const dataDirectories = [...new Set(dataFiles.map(file => file.path.includes("/") ? file.path.split("/")[0] : "(root)"))].sort();
const datasets = manifest.datasets.map(dataset => {
  const layers = dataset.layers.map(layer => {
    const pathname = new URL(layer.url, baseUrl).pathname;
    if (!pathname.startsWith("/data/")) throw new Error(`Unexpected boundary URL: ${layer.url}`);
    const file = byDataPath.get(decodeURIComponent(pathname.slice("/data/".length)));
    if (!file || file.precompressedVariant) throw new Error(`Missing original boundary file: ${layer.url}`);
    return { id: layer.id, level: layer.level, url: layer.url, featureCount: layer.featureCount, rawBytes: file.bytes };
  });
  return { id: dataset.id, year: dataset.year, periodId: dataset.periodId, rawBytes: layers.reduce((total, layer) => total + layer.rawBytes, 0), layers };
});
const assets = assetFiles.filter(file => !file.precompressedVariant && /\.(js|css)$/.test(file.path)).map(file => ({
  url: `/assets/${file.path}`, rawBytes: file.bytes,
  kind: file.path.endsWith(".css") ? "css" : /worker/i.test(file.path) ? "worker" : "javascript",
}));
const mainScript = assets.find(asset => asset.kind === "javascript" && /\/index-/.test(asset.url));
if (!mainScript) throw new Error("Built index JavaScript was not found; run npm run build first");
const gzipSample = dataFiles.find(file => file.path.startsWith("tang-detail/") && file.path.endsWith(".geojson.gz") && !file.precompressedVariant);
if (!gzipSample) throw new Error("No original tang-detail gzip file found");
const modernFile = byDataPath.get("modern-correspondence.json");
const boundaryIndexes = datasets.flatMap(dataset => {
  const file = byDataPath.get(`boundaries/indexes/${dataset.id}.json`);
  return file ? [{ id: dataset.id, url: `/data/${file.path}`, rawBytes: file.bytes }] : [];
});
const modernSliceManifestFile = byDataPath.get("modern-correspondence/manifest.json");
const modernSlices = [];
if (modernSliceManifestFile) {
  modernSlices.push({ id: "manifest", url: "/data/modern-correspondence/manifest.json", rawBytes: modernSliceManifestFile.bytes });
  const sliceManifest = JSON.parse(await readFile(path.join(dataRoot, modernSliceManifestFile.path), "utf8"));
  for (const dataset of sliceManifest.datasets) {
    const file = byDataPath.get(new URL(dataset.url, baseUrl).pathname.slice("/data/".length));
    if (!file) throw new Error(`Missing correspondence slice: ${dataset.url}`);
    modernSlices.push({ id: dataset.id, url: dataset.url, rawBytes: file.bytes });
  }
}
const report = {
  measuredAt: new Date().toISOString(),
  dataRoot: path.relative(root, dataRoot).split(path.sep).join("/"),
  distDir: path.relative(root, distDir).split(path.sep).join("/"),
  baseUrl: baseUrl.origin,
  units: "bytes (decimal MB = bytes / 1000000; MiB = bytes / 1048576)",
  measurement: "File sizes from recursive filesystem stat. HTTP body transfer bytes from curl size_download without --compressed; headers are recorded separately, not used as size estimates. First-screen browser HAR is a separate measurement.",
  data: { ...summarize(dataFiles), directories: Object.fromEntries(dataDirectories.map(directory => [directory, summarize(dataFiles.filter(file => directory === "(root)" ? !file.path.includes("/") : file.path.startsWith(directory + "/")))])) },
  boundaries: { ...summarize(dataFiles.filter(file => file.path.startsWith("boundaries/"))), datasetLayerBytes: datasets.reduce((total, dataset) => total + dataset.rawBytes, 0), datasets },
  modernCorrespondence: { url: "/data/modern-correspondence.json", rawBytes: modernFile.bytes, entryCount: Object.keys(correspondence.entries).length },
  boundaryIndexes,
  modernSlices,
  assetStorage: summarize(assetFiles),
  assets,
  originalGzipSample: { url: `/data/${gzipSample.path}`, rawBytes: gzipSample.bytes },
  requests: [],
};

if (!options.inventoryOnly) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "historical-atlas-transfer-"));
  let sequence = 0;
  async function measure(urlPath, acceptEncoding) {
    const headerPath = path.join(temporaryDirectory, `${sequence++}.headers`);
    const args = ["--silent", "--show-error", "--fail", "--max-time", "120", "--dump-header", headerPath, "--output", process.platform === "win32" ? "NUL" : "/dev/null", "--write-out", "%{size_download} %{http_code} %{time_total}\n"];
    if (acceptEncoding) args.push("--header", `Accept-Encoding: ${acceptEncoding}`);
    args.push(new URL(urlPath, baseUrl).href);
    const { stdout } = await execute("curl", args, { encoding: "utf8" });
    const [transferBytes, statusCode, seconds] = stdout.trim().split(/\s+/).map(Number);
    if (![transferBytes, statusCode, seconds].every(Number.isFinite)) throw new Error(`Invalid curl metrics for ${urlPath}: ${stdout}`);
    const result = { url: urlPath, acceptEncoding: acceptEncoding ?? null, transferBytes, statusCode, seconds, ...parseHeaders(await readFile(headerPath, "utf8")) };
    report.requests.push(result);
    return result;
  }
  try {
    for (const dataset of datasets) {
      dataset.transferBytes = 0;
      for (const layer of dataset.layers) {
        const response = await measure(layer.url, "br,gzip");
        layer.transferBytes = response.transferBytes;
        layer.contentEncoding = response.headers["content-encoding"] ?? null;
        dataset.transferBytes += response.transferBytes;
      }
    }
    report.boundaries.datasetLayerTransferBytes = datasets.reduce((total, dataset) => total + dataset.transferBytes, 0);
    for (const item of [report.modernCorrespondence, ...boundaryIndexes, ...modernSlices, ...assets, report.originalGzipSample]) {
      const response = await measure(item.url, "br,gzip");
      item.transferBytes = response.transferBytes;
      item.contentEncoding = response.headers["content-encoding"] ?? null;
    }
    await measure("/", "br,gzip");
    await measure("/index.html", "br,gzip");
    for (const url of ["/data/boundaries/hartwell-1200-county.geojson", report.modernCorrespondence.url, mainScript.url, report.originalGzipSample.url, "/index.html"]) await measure(url, null);
    for (const url of ["/data/boundaries/hartwell-1200-county.geojson", mainScript.url, report.originalGzipSample.url]) await measure(url, "gzip");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const serialized = JSON.stringify(report, null, 2) + "\n";
if (options.output) {
  const destination = path.resolve(root, options.output);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, serialized);
  console.log(JSON.stringify({ output: destination, data: report.data.originalBytes, boundaryLayers: report.boundaries.datasetLayerBytes, boundaryTransfer: report.boundaries.datasetLayerTransferBytes, modernCorrespondence: report.modernCorrespondence, assets: report.assets, requests: report.requests.length }, null, 2));
} else {
  process.stdout.write(serialized);
}
