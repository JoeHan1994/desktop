"""向量库基础设施：封装 Qdrant 的写入与检索。

优先连接远端 Qdrant 服务器；若健康检查失败则自动降级为本地文件模式。
写入阶段清理旧集合避免重复；检索阶段返回带向量相似度分数的领域结果。
"""

from __future__ import annotations

import urllib.request
import urllib.error

from langchain_core.documents import Document as LcDocument
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient

from . import config
from ..domain import Chunk, SearchResult
from .embedder import OllamaEmbedder


def _is_remote_healthy(url: str, timeout: float = 3.0) -> bool:
    """探测远端 Qdrant 健康端点，返回是否可达。"""
    health_url = url.rstrip("/") + "/healthz"
    try:
        with urllib.request.urlopen(health_url, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


class QdrantStore:
    """Qdrant 向量库封装：优先使用远端服务器，不可达时自动降级为本地文件模式。"""

    def __init__(
        self,
        embedder: OllamaEmbedder,
        url: str = config.QDRANT_URL,
        local_path: str = config.QDRANT_PATH,
        collection_name: str = config.COLLECTION_NAME,
    ) -> None:
        self._embedder = embedder
        self._collection = collection_name

        if _is_remote_healthy(url):
            self._url: str | None = url
            self._path: str | None = None
            self._client = QdrantClient(url=url)
            print(f"[QdrantStore] 远端模式: {url}")
        else:
            self._url = None
            self._path = local_path
            self._client = QdrantClient(path=local_path)
            print(f"[QdrantStore] 远端不可达，降级为本地模式: {local_path}")

        self._store: QdrantVectorStore | None = None

    def write(self, chunks: list[Chunk], recreate: bool = True) -> int:
        """将文本块写入向量库，返回集合中的文档总数。

        recreate=True 时先删除同名旧集合，避免多次运行导致重复文档。
        """
        if recreate:
            existing = [c.name for c in self._client.get_collections().collections]
            for name in existing:
                self._client.delete_collection(name)

        lc_docs = [
            LcDocument(page_content=c.text, metadata={**c.metadata, "source": c.source})
            for c in chunks
        ]
        kwargs: dict = dict(
            documents=lc_docs,
            embedding=self._embedder.langchain_embeddings,
            collection_name=self._collection,
        )
        if self._url is not None:
            kwargs["url"] = self._url
        else:
            # 本地模式：先关闭现有客户端避免文件锁冲突
            self._client.close()
            kwargs["path"] = self._path
        self._store = QdrantVectorStore.from_documents(**kwargs)
        self._client = self._store.client
        return self._client.count(self._collection).count

    def _ensure_store(self) -> QdrantVectorStore:
        """惰性绑定到已存在的集合（问答阶段无需重新写入即可检索）。"""
        if self._store is None:
            self._store = QdrantVectorStore(
                client=self._client,
                collection_name=self._collection,
                embedding=self._embedder.langchain_embeddings,
            )
        return self._store

    def _collection_exists(self) -> bool:
        """检查集合是否已存在于 Qdrant。"""
        existing = [c.name for c in self._client.get_collections().collections]
        return self._collection in existing

    def search(self, query: str, k: int = 12) -> list[SearchResult]:
        """向量粗召回：返回带相似度分数的候选（分数越大越相关）。
        
        若集合尚未创建（文档未导入），返回空列表而非抛出异常。
        """
        if not self._collection_exists():
            return []
        store = self._ensure_store()
        hits = store.similarity_search_with_score(query, k=k)
        results: list[SearchResult] = []
        for doc, score in hits:
            meta = doc.metadata or {}
            results.append(
                SearchResult(
                    id=str(meta.get("_id", meta.get("chunk_id", ""))),
                    text=doc.page_content,
                    source=str(meta.get("source", "")),
                    score=float(score),
                    metadata=meta,
                )
            )
        return results
