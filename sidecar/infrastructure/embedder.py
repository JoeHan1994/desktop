"""Embedding 基础设施：封装 Ollama 向量化模型。

对外提供单条 / 批量向量化接口，屏蔽 LangChain 的具体实现细节。
批量接口自动分批（默认每批 16 条）并在遭遇连接错误时指数退避重试，
避免远端 Ollama 因单次请求数据量过大而强制断连（WinError 10054）。
"""

from __future__ import annotations

import time

import httpx
from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings

from . import config

_EMBED_BATCH_SIZE = 16   # 每次发往 Ollama 的最大文本数
_MAX_RETRIES = 3         # 遭遇连接错误时最多重试次数

# 可重试的连接异常类型（OSError 含 WinError 10054；httpx 异常不继承 OSError）
_RETRYABLE = (OSError, httpx.TransportError, httpx.RemoteProtocolError)


def _is_ollama_healthy(base_url: str, timeout: float = 5.0) -> bool:
    """探测 Ollama 服务是否可用（检查 /api/tags，无需加载模型）。"""
    try:
        r = httpx.get(base_url.rstrip("/") + "/api/tags", timeout=timeout)
        return r.status_code == 200
    except Exception:
        return False


class _SafeOllamaEmbeddings(Embeddings):
    """分批 + 重试包装，防止大批量请求导致远端 Ollama 断连。"""

    def __init__(self, inner: OllamaEmbeddings, batch_size: int = _EMBED_BATCH_SIZE) -> None:
        self._inner = inner
        self._batch_size = batch_size

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        results: list[list[float]] = []
        total_batches = (len(texts) + self._batch_size - 1) // self._batch_size
        for batch_idx, i in enumerate(range(0, len(texts), self._batch_size)):
            batch = texts[i : i + self._batch_size]
            for attempt in range(_MAX_RETRIES):
                try:
                    results.extend(self._inner.embed_documents(batch))
                    break
                except _RETRYABLE as exc:
                    if attempt < _MAX_RETRIES - 1:
                        wait = 2 ** attempt
                        print(
                            f"[OllamaEmbedder] 批次 {batch_idx + 1}/{total_batches} 失败"
                            f"（{exc}），{wait}s 后重试（{attempt + 1}/{_MAX_RETRIES}）"
                        )
                        time.sleep(wait)
                    else:
                        raise ConnectionError(
                            f"Ollama 向量化服务不可用（{config.OLLAMA_BASE_URL}），"
                            f"请确认 Ollama 已启动且模型 {config.EMBED_MODEL!r} 已加载。"
                            f"原始错误：{exc}"
                        ) from exc
        return results

    def embed_query(self, text: str) -> list[float]:
        for attempt in range(_MAX_RETRIES):
            try:
                return self._inner.embed_query(text)
            except _RETRYABLE as exc:
                if attempt < _MAX_RETRIES - 1:
                    wait = 2 ** attempt
                    print(f"[OllamaEmbedder] 查询嵌入失败（{exc}），{wait}s 后重试（{attempt + 1}/{_MAX_RETRIES}）")
                    time.sleep(wait)
                else:
                    raise ConnectionError(
                        f"Ollama 向量化服务不可用（{config.OLLAMA_BASE_URL}），"
                        f"请确认 Ollama 已启动且模型 {config.EMBED_MODEL!r} 已加载。"
                        f"原始错误：{exc}"
                    ) from exc


# bge-m3 首次调用需从磁盘加载模型，给足够长的超时
_OLLAMA_REQUEST_TIMEOUT = 120  # seconds


class OllamaEmbedder:
    """基于 Ollama 的文本向量化器（默认模型 bge-m3）。"""

    def __init__(
        self,
        model: str = config.EMBED_MODEL,
        base_url: str = config.OLLAMA_BASE_URL,
    ) -> None:
        raw = OllamaEmbeddings(
            model=model,
            base_url=base_url,
            sync_client_kwargs={"timeout": _OLLAMA_REQUEST_TIMEOUT},
        )
        self._model = raw
        self._safe = _SafeOllamaEmbeddings(raw)

    @property
    def langchain_embeddings(self) -> Embeddings:
        """暴露带分批重试的 Embeddings，供向量库 from_documents 使用。"""
        return self._safe

    def embed(self, text: str) -> list[float]:
        """将单条文本向量化（含重试）。"""
        return self._safe.embed_query(text)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """批量向量化多条文本（含分批重试）。"""
        return self._safe.embed_documents(texts)
