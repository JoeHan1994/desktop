import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const args = process.argv.slice(2);
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

const child = spawn('tauri', args, {
  env,
  shell: process.platform === 'win32',
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