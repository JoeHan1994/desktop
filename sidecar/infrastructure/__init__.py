"""基础设施层：外部依赖封装（Ollama / Qdrant / Reranker / 解析器）。"""

from . import config
from .embedder import OllamaEmbedder
from .vector_store import QdrantStore

__all__ = ["config", "OllamaEmbedder", "QdrantStore"]
