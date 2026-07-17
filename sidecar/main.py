"""Sidecar 服务入口：启动 FastAPI + Uvicorn。

用法（任选其一）：
    cd sidecar && python main.py
    python sidecar/main.py

可通过环境变量覆盖监听地址（见 infrastructure/config.py）：
    TERRAFORGE_SIDECAR_HOST / TERRAFORGE_SIDECAR_PORT
"""

from __future__ import annotations

import sys
from pathlib import Path

# 将 desktop/ 加入 sys.path，使模块可作为 `sidecar` 包被导入（支持相对导入）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402

from sidecar.infrastructure import config  # noqa: E402


def main() -> None:
    print(f"[Sidecar] 启动 HTTP 服务: http://{config.HTTP_HOST}:{config.HTTP_PORT}")
    print(f"[Sidecar] Ollama: {config.OLLAMA_BASE_URL} | Qdrant: {config.QDRANT_URL}")
    uvicorn.run(
        "sidecar.interfaces.http_server:app",
        host=config.HTTP_HOST,
        port=config.HTTP_PORT,
        reload=False,
    )


if __name__ == "__main__":
    main()
