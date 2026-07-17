import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { createConnection } from 'node:net';

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

// 3. 启动 Python sidecar（FastAPI 服务，端口 8765）
// 仅在 dev 模式下自动拉起（build 时跳过，由 Tauri 打包的 externalBin 负责）
let sidecarProc = null;
if (args[0] === 'dev') {
  const pythonExe = isWin
    ? resolve('.venv', 'Scripts', 'python.exe')
    : resolve('.venv', 'bin', 'python');
  const pythonCmd = existsSync(pythonExe) ? pythonExe : 'python';

  console.log('[sidecar] 启动 Python sidecar …');
  sidecarProc = spawn(pythonCmd, ['sidecar/main.py'], {
    cwd: resolve('.'),
    env: { ...process.env },
    stdio: 'inherit',
  });

  sidecarProc.on('error', (err) => {
    console.error('[sidecar] 启动失败：', err.message);
  });

  // 等待端口 8765 就绪（最多 30 秒）
  await new Promise((resolveReady) => {
    const deadline = Date.now() + 30_000;
    const tryConnect = () => {
      const sock = createConnection({ port: 8765, host: '127.0.0.1' });
      sock.on('connect', () => { sock.destroy(); resolveReady(); });
      sock.on('error', () => {
        if (Date.now() < deadline) setTimeout(tryConnect, 500);
        else { console.warn('[sidecar] 等待超时，继续启动 Tauri …'); resolveReady(); }
      });
    };
    tryConnect();
  });
  console.log('[sidecar] Python sidecar 就绪');
}

const child = spawn(cmd, args, {
  env,
  shell: isWin,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (sidecarProc) sidecarProc.kill();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  if (sidecarProc) sidecarProc.kill();
  console.error(error.message);
  process.exit(1);
});