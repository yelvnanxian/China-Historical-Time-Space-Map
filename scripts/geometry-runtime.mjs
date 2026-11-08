import { execFile, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = path.join(root, 'artifacts/geometry-env', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const execute = promisify(execFile);
function run(file, args) { return new Promise((resolve, reject) => { const child = spawn(file, args, { cwd: root, stdio: 'inherit' }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`command failed: ${file}`))); }); }
async function setup() {
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  let selected;
  for (const candidate of candidates) { try { await execute(candidate, ['-c', 'import sys; assert sys.version_info >= (3, 10)']); selected = candidate; break; } catch {} }
  if (!selected) throw new Error('需要 Python 3.10+ 才能创建几何构建环境');
  await run(selected, ['-m', 'venv', path.join(root, 'artifacts/geometry-env')]);
  await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', '-r', path.join(root, 'scripts/geometry-requirements.txt')]);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await setup();
export { python };
