"""基础设施层共享配置。

集中管理外部服务地址与模型名称，避免散落在各模块中。
可通过环境变量覆盖，便于部署到不同环境。
"""

from __future__ import annotations

import os
from pathlib import Path

# sidecar/ 目录（本文件位于 sidecar/infrastructure/config.py）
SIDECAR_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SIDECAR_DIR.parent  # desktop/

# ── Ollama ────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.environ.get("TERRAFORGE_OLLAMA_URL", "http://127.0.0.1:11434") #"http://192.168.51.48:11434"
EMBED_MODEL = os.environ.get("TERRAFORGE_EMBED_MODEL", "bge-m3:latest")
LLM_MODEL = os.environ.get("TERRAFORGE_LLM_MODEL", "qwen2.5:3b") #gemma4:e4b
TRANSLATE_MODEL = os.environ.get("TERRAFORGE_TRANSLATE_MODEL", LLM_MODEL)

# ── ChromaDB（本地文件向量库，无需额外服务）──────────────────────────────
CHROMA_PATH = os.environ.get(
    "TERRAFORGE_CHROMA_PATH", str(SIDECAR_DIR / "terraforge_chroma_db")
)
COLLECTION_NAME = os.environ.get("TERRAFORGE_COLLECTION", "terraforge_docs")

# ── Qdrant（可选远端服务，不可达时自动降级为本地文件模式）────────────────
QDRANT_URL = os.environ.get("TERRAFORGE_QDRANT_URL", "http://192.168.51.48:6333")
QDRANT_PATH = os.environ.get(
    "TERRAFORGE_QDRANT_PATH", str(SIDECAR_DIR / "terraforge_qdrant_db")
)

# ── Reranker ──────────────────────────────────────────────────────────────
RERANKER_MODEL = os.environ.get("TERRAFORGE_RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
HF_CACHE_DIR = os.environ.get("TERRAFORGE_HF_CACHE", str(SIDECAR_DIR / "hf_cache"))

# ── 文档来源 ──────────────────────────────────────────────────────────────
DOCS_DIR = os.environ.get("TERRAFORGE_DOCS_DIR", str(PROJECT_ROOT / "docs"))

# ── YAML 提示词配置路径 ────────────────────────────────────────────────────
PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
INTENT_FILTER_PROMPT = str(PROMPTS_DIR / "intent_filter.yaml")
ANSWER_PROMPT = str(PROMPTS_DIR / "answer.yaml")

# ── 元数据清单（入库时生成，意图过滤时读取）────────────────────────────────
METADATA_CATALOG_PATH = os.environ.get(
    "TERRAFORGE_METADATA_CATALOG",
    str(SIDECAR_DIR / "metadata_catalog.json"),
)

# ── HTTP 服务 ─────────────────────────────────────────────────────────────
HTTP_HOST = os.environ.get("TERRAFORGE_SIDECAR_HOST", "127.0.0.1")
HTTP_PORT = int(os.environ.get("TERRAFORGE_SIDECAR_PORT", "8765"))
