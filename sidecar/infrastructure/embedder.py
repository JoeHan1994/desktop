"""Embedding 基础设施：封装 Ollama 向量化模型。

对外提供单条 / 批量向量化接口，屏蔽 LangChain 的具体实现细节。
"""

from __future__ import annotations

from langchain_ollama import OllamaEmbeddings

from . import config


class OllamaEmbedder:
    """基于 Ollama 的文本向量化器（默认模型 bge-m3）。"""

    def __init__(
        self,
        model: str = config.EMBED_MODEL,
        base_url: str = config.OLLAMA_BASE_URL,
    ) -> None:
        self._model = OllamaEmbeddings(model=model, base_url=base_url)

    @property
    def langchain_embeddings(self) -> OllamaEmbeddings:
        """暴露底层 LangChain Embeddings，供向量库 from_documents 使用。"""
        return self._model

    def embed(self, text: str) -> list[float]:
        """将单条文本向量化。"""
        return self._model.embed_query(text)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """批量向量化多条文本。"""
        return self._model.embed_documents(texts)
