# build-sidecar.ps1
# 用 PyInstaller 将 Python sidecar 打包成独立 exe，放入 Tauri 的 externalBin 目录。
# 发布前运行：.\scripts\build-sidecar.ps1
# 之后再执行：npm run tauri:build

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root   = Split-Path $PSScriptRoot -Parent
$venv   = Join-Path $root '.venv'
$python = Join-Path $venv 'Scripts\python.exe'
$pip    = Join-Path $venv 'Scripts\pip.exe'

# 1. 安装 PyInstaller（如果还没装）
& $pip install pyinstaller --quiet

# 2. 获取目标 triple（由 rustc 报告）
$triple = (rustc -vV 2>&1 | Select-String 'host:').ToString().Trim().Split()[-1]
Write-Host "Target triple: $triple"

# 3. 输出目录
$binDir = Join-Path $root 'src-tauri\binaries'
New-Item -ItemType Directory -Force $binDir | Out-Null

# 4. 运行 PyInstaller
#    --onefile        → 单文件 exe（体积约 1-3 GB，含 torch/transformers）
#    --name sidecar   → 输出名 sidecar.exe
#    --distpath       → 直接输出到 binaries/
Push-Location $root
& $python -m PyInstaller `
    --onefile `
    --name "sidecar" `
    --distpath $binDir `
    --workpath "$root\build\pyinstaller-work" `
    --specpath "$root\build" `
    --hidden-import uvicorn.logging `
    --hidden-import uvicorn.loops `
    --hidden-import uvicorn.loops.auto `
    --hidden-import uvicorn.protocols `
    --hidden-import uvicorn.protocols.http `
    --hidden-import uvicorn.protocols.http.auto `
    --hidden-import uvicorn.protocols.websockets `
    --hidden-import uvicorn.protocols.websockets.auto `
    --hidden-import uvicorn.lifespan `
    --hidden-import uvicorn.lifespan.on `
    sidecar\main.py
Pop-Location

# 5. 重命名为 Tauri 期望的 platform-triple 格式
$src  = Join-Path $binDir 'sidecar.exe'
$dest = Join-Path $binDir "sidecar-$triple.exe"
if (Test-Path $dest) { Remove-Item $dest -Force }
Rename-Item $src $dest
Write-Host "sidecar binary ready: $dest"
Write-Host ""
Write-Host "Now run: npm run tauri:build"
