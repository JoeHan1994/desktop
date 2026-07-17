"""应用服务：文档摄取流程编排。

遍历 docs 目录 → 解析为文本块 → 向量化写入 Qdrant，返回统计信息。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..domain import Chunk
from ..infrastructure import config
from ..infrastructure.parsers import parse_docs_directory
from ..infrastructure.vector_store import QdrantStore


class IngestionService:
    """文档摄取服务：解析 + 向量化 + 写入。"""

    def __init__(self, store: QdrantStore) -> None:
        self._store = store

    def run(self, docs_dir: str | None = None) -> dict[str, Any]:
        """执行完整摄取流程，返回统计字典。"""
        root = Path(docs_dir or config.DOCS_DIR)
        if not root.exists():
            raise FileNotFoundError(f"找不到 docs 目录: {root}")

        documents = parse_docs_directory(root)
        all_chunks: list[Chunk] = [c for doc in documents for c in doc.chunks]

        total_docs = self._store.write(all_chunks, recreate=True)

        video_chunks = sum(1 for c in all_chunks if c.metadata.get("has_video"))
        table_chunks = sum(1 for c in all_chunks if c.metadata.get("contains_table"))
        step_chunks = sum(1 for c in all_chunks if c.metadata.get("has_steps"))
        code_chunks = sum(1 for c in all_chunks if c.metadata.get("has_code"))

        return {
            "file_count": len(documents),
            "chunk_count": len(all_chunks),
            "collection_count": total_docs,
            "video_chunks": video_chunks,
            "table_chunks": table_chunks,
            "step_chunks": step_chunks,
            "code_chunks": code_chunks,
        }
