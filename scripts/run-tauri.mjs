import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const args = process.argv.slice(2);

// 1. 将 ~/.cargo/bin 追加到 PATH（Tauri 的 Rust 工具链需要）
const cargoBin = join(homedir(), '.cargo', 'bin');
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
const currentPath = process.env[pathKey] ?? '';
const pathSegments = currentPath.split(delimiter).filter(Boolean);
const hasCargoBin = pathSegments.some((segment) => segment.toLowerCase() === cargoBin.toLowerCase());
const nextPath = existsSync(cargoBin) && !hasCargoBin
  ? [cargoBin, ...pathSegments].join(delimiter)
  : currentPath;

const env = {
  ...process.env,
  [pathKey]: nextPath,
  PATH: nextPath,
};

// 2. 优先使用本地 node_modules/.bin/tauri（本地 devDependency），回退到全局 tauri
const localBinDir = resolve('node_modules', '.bin');
const isWin = process.platform === 'win32';
const localBin = join(localBinDir, isWin ? 'tauri.cmd' : 'tauri');
const cmd = existsSync(localBin) ? localBin : 'tauri';

const child = spawn(cmd, args, {
  env,
  shell: isWin,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});