"""向量库基础设施：Qdrant 远端优先，不可达时自动切换 ChromaDB 本地文件模式。

启动时探测 Qdrant 远端健康端点：
  - 可达  → 使用 Qdrant（远端服务）
  - 不可达 → 自动降级为 ChromaDB（本地 SQLite 文件，零配置，无文件锁问题）

两种后端共用相同的 write / search 接口，上层无需感知差异。
"""

from __future__ import annotations

import urllib.request
from typing import Any, Literal

import chromadb
from langchain_chroma import Chroma
from langchain_core.documents import Document as LcDocument
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue

from . import config
from ..domain import Chunk, SearchResult
from ..domain.search import FilterParams
from .embedder import OllamaEmbedder

_Backend = Literal["qdrant", "chroma"]

RETRIEVE_K = 12


def _is_remote_healthy(url: str, timeout: float = 3.0) -> bool:
    """探测远端 Qdrant 健康端点，返回是否可达。"""
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/healthz", timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


class VectorStore:
    """统一向量库接口：Qdrant 可达时用远端，否则自动切换 ChromaDB 本地文件。"""

    def __init__(
        self,
        embedder: OllamaEmbedder,
        qdrant_url: str = config.QDRANT_URL,
        qdrant_path: str = config.QDRANT_PATH,
        chroma_path: str = config.CHROMA_PATH,
        collection_name: str = config.COLLECTION_NAME,
    ) -> None:
        self._embedder = embedder
        self._collection = collection_name
        self._store: Chroma | QdrantVectorStore | None = None

        if _is_remote_healthy(qdrant_url):
            self._backend: _Backend = "qdrant"
            self._qdrant_client: QdrantClient | None = QdrantClient(url=qdrant_url)
            self._chroma_client: chromadb.ClientAPI | None = None
            print(f"[VectorStore] Qdrant 远端模式: {qdrant_url}")
        else:
            self._backend = "chroma"
            self._qdrant_client = None
            self._chroma_client = chromadb.PersistentClient(path=chroma_path)
            print(f"[VectorStore] Qdrant 不可达，已切换至 ChromaDB 本地模式: {chroma_path}")

    # ── 写入 ───────────────────────────────────────────────────────────────

    def write(self, chunks: list[Chunk], recreate: bool = True) -> int:
        """向量化并写入当前后端，返回集合文档总数。"""
        if self._backend == "qdrant":
            return self._write_qdrant(chunks, recreate)
        return self._write_chroma(chunks, recreate)

    def _write_qdrant(self, chunks: list[Chunk], recreate: bool) -> int:
        assert self._qdrant_client is not None
        if recreate:
            try:
                for col in self._qdrant_client.get_collections().collections:
                    self._qdrant_client.delete_collection(col.name)
            except Exception as exc:
                print(f"[VectorStore/Qdrant] 删除旧集合忽略异常: {exc}")

        lc_docs = self._to_lc_docs(chunks)
        self._store = QdrantVectorStore.from_documents(
            documents=lc_docs,
            embedding=self._embedder.langchain_embeddings,
            collection_name=self._collection,
            client=self._qdrant_client,
        )
        return self._qdrant_client.count(self._collection).count

    def _write_chroma(self, chunks: list[Chunk], recreate: bool) -> int:
        assert self._chroma_client is not None
        if recreate:
            try:
                self._chroma_client.delete_collection(self._collection)
            except Exception:
                pass
            self._store = None

        lc_docs = [
            LcDocument(
                page_content=c.text,
                metadata=self._sanitize_meta({**c.metadata, "source": c.source}),
            )
            for c in chunks
        ]
        self._store = Chroma.from_documents(
            documents=lc_docs,
            embedding=self._embedder.langchain_embeddings,
            collection_name=self._collection,
            client=self._chroma_client,
        )
        return self._chroma_client.get_collection(self._collection).count()

    # ── 删除 ───────────────────────────────────────────────────────────────

    def delete_all(self) -> None:
        """清空当前集合（删除全部向量），保留集合结构。"""
        if self._backend == "qdrant":
            assert self._qdrant_client is not None
            try:
                self._qdrant_client.delete_collection(self._collection)
            except Exception as exc:
                print(f"[VectorStore/Qdrant] 清空集合失败: {exc}")
        else:
            assert self._chroma_client is not None
            try:
                self._chroma_client.delete_collection(self._collection)
            except Exception as exc:
                print(f"[VectorStore/Chroma] 清空集合失败: {exc}")
        self._store = None

    def delete_by_source(self, source: str) -> None:
        """删除向量库中 source 字段匹配指定值的全部记录。"""
        if not self._collection_exists():
            return
        if self._backend == "qdrant":
            assert self._qdrant_client is not None
            try:
                self._qdrant_client.delete(
                    collection_name=self._collection,
                    points_selector=FilterSelector(
                        filter=Filter(must=[
                            FieldCondition(key="metadata.source", match=MatchValue(value=source))
                        ])
                    ),
                )
            except Exception as exc:
                print(f"[VectorStore/Qdrant] 按 source 删除失败: {exc}")
        else:
            assert self._chroma_client is not None
            try:
                col = self._chroma_client.get_collection(self._collection)
                col.delete(where={"source": source})
            except Exception as exc:
                print(f"[VectorStore/Chroma] 按 source 删除失败: {exc}")

    # ── 检索 ───────────────────────────────────────────────────────────────

    def search(
        self,
        query: str,
        k: int = RETRIEVE_K,
        filters: FilterParams | None = None,
    ) -> list[SearchResult]:
        """向量检索 + 元数据过滤，返回带相似度分数的候选列表。"""
        if not self._collection_exists():
            return []
        store = self._ensure_store()
        if self._backend == "qdrant":
            f = self._build_qdrant_filter(filters) if filters else None
        else:
            f = self._build_chroma_filter(filters) if filters else None

        try:
            hits = store.similarity_search_with_score(query, k=k, filter=f)
        except Exception:
            # 过滤条件无命中时某些后端会抛异常，回退到不过滤
            hits = store.similarity_search_with_score(query, k=k)

        results: list[SearchResult] = []
        for doc, score in hits:
            meta = doc.metadata or {}
            results.append(
                SearchResult(
                    id=str(meta.get("chunk_id", "")),
                    text=doc.page_content,
                    source=str(meta.get("source", "")),
                    score=float(score),
                    metadata=meta,
                )
            )
        return results

    # ── 内部工具 ───────────────────────────────────────────────────────────

    def _collection_exists(self) -> bool:
        try:
            if self._backend == "qdrant":
                assert self._qdrant_client is not None
                names = [c.name for c in self._qdrant_client.get_collections().collections]
                return self._collection in names
            else:
                assert self._chroma_client is not None
                self._chroma_client.get_collection(self._collection)
                return True
        except Exception:
            return False

    def _ensure_store(self) -> Chroma | QdrantVectorStore:
        if self._store is not None:
            return self._store
        if self._backend == "qdrant":
            assert self._qdrant_client is not None
            self._store = QdrantVectorStore(
                client=self._qdrant_client,
                collection_name=self._collection,
                embedding=self._embedder.langchain_embeddings,
            )
        else:
            assert self._chroma_client is not None
            self._store = Chroma(
                client=self._chroma_client,
                collection_name=self._collection,
                embedding_function=self._embedder.langchain_embeddings,
            )
        return self._store

    def _to_lc_docs(self, chunks: list[Chunk]) -> list[LcDocument]:
        return [
            LcDocument(page_content=c.text, metadata={**c.metadata, "source": c.source})
            for c in chunks
        ]

    @staticmethod
    def _sanitize_meta(meta: dict[str, Any]) -> dict[str, Any]:
        """ChromaDB 只接受 str / int / float / bool，剔除 None 及不支持类型。"""
        return {
            k: v for k, v in meta.items()
            if v is not None and isinstance(v, (str, int, float, bool))
        } | {
            k: str(v) for k, v in meta.items()
            if v is not None and not isinstance(v, (str, int, float, bool))
        }

    # ── 过滤构建 ───────────────────────────────────────────────────────────

    @staticmethod
    def _build_qdrant_filter(params: FilterParams) -> Filter | None:
        conditions: list[FieldCondition] = []
        for key, val in {
            "has_video": params.has_video,
            "has_code": params.has_code,
            "has_steps": params.has_steps,
            "contains_table": params.contains_table,
        }.items():
            if val is not None:
                conditions.append(
                    FieldCondition(key=f"metadata.{key}", match=MatchValue(value=val))
                )
        return Filter(must=conditions) if conditions else None

    @staticmethod
    def _build_chroma_filter(params: FilterParams) -> dict | None:
        conditions: list[dict] = []
        for key, val in {
            "has_video": params.has_video,
            "has_code": params.has_code,
            "has_steps": params.has_steps,
            "contains_table": params.contains_table,
        }.items():
            if val is not None:
                conditions.append({key: {"$eq": val}})
        if not conditions:
            return None
        return conditions[0] if len(conditions) == 1 else {"$and": conditions}
