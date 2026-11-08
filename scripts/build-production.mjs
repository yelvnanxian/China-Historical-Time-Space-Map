import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

function run(file, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(file)} failed`)));
  });
}

export async function stageProductionBuild(projectRoot, buildStaged) {
  const stage = await mkdtemp(path.join(projectRoot, 'artifacts/production-build-'));
  const publicDir = path.join(stage, 'public'); const outputDir = path.join(stage, 'dist');
  const destination = path.join(projectRoot, 'dist'); const previous = path.join(stage, 'previous-dist');
  let preserve = false;
  try {
    await cp(path.join(projectRoot, 'public'), publicDir, { recursive: true, dereference: true });
    await buildStaged({ stage, publicDir, outputDir });
    if (!(await stat(path.join(outputDir, 'index.html'))).isFile()) throw new Error('构建没有生成 index.html');
    let moved = false;
    try { await rename(destination, previous); moved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(outputDir, destination); }
    catch (error) { if (moved) await rename(previous, destination); else throw error; }
  } catch (error) { preserve = true; throw error; }
  finally { if (!preserve) await rm(stage, { recursive: true, force: true }); }
}

async function buildProduction() {
  await mkdir(path.join(root, 'artifacts/performance'), { recursive: true });
  await stageProductionBuild(root, async ({ stage, publicDir, outputDir }) => {
    const python = process.env.MAP_GEOMETRY_PYTHON || path.join(root, 'artifacts/geometry-env/bin/python');
    const optimized = path.join(stage, 'optimized-public');
    const report = path.join(root, 'artifacts/performance/p2-precision-report.json');
    await new Promise((resolve, reject) => { const child = spawn(python, [path.join(root, 'scripts/build-boundary-precision.py'), '--input-root', publicDir, '--output-root', optimized, '--report', report], { cwd: root, stdio: 'inherit' }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('边界几何修复失败'))); });
    await cp(path.join(optimized, 'data/boundaries'), path.join(publicDir, 'data/boundaries'), { recursive: true });
    await run(require.resolve('tsx/cli'), [path.join(root, 'scripts/build-boundary-indexes.ts'), '--input-root', publicDir]);
    await run(require.resolve('typescript/bin/tsc'), ['--noEmit']);
    await run(path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), ['build'], { ...process.env, MAP_BUILD_STAGE_DIR: stage });
    await run(path.join(root, 'scripts/precompress-static.mjs'), [outputDir]);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildProduction();
