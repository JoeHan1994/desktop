"""应用服务：文档摄取流程编排。

遍历 docs 目录 → 解析为文本块 → 向量化写入 Qdrant → 生成元数据清单。
元数据清单（metadata_catalog.json）汇总所有 chunk 的可用过滤字段与标签词表，
供阶段二意图过滤步骤使用。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..domain import Chunk
from ..infrastructure import config, ku_store
from ..infrastructure.embedder import _is_ollama_healthy
from ..infrastructure.parsers import parse_docs_directory
from ..infrastructure.vector_store import VectorStore


def _build_metadata_catalog(chunks: list[Chunk]) -> dict[str, Any]:
    """遍历所有 chunk 的 metadata，汇总可用过滤字段与标签词表。

    返回结构：
    {
        "tags":           ["assign", "checkout", ...],  # 去重排序后的完整标签词表
        "has_video":      bool,  # 语料库中是否存在含视频的 chunk
        "has_code":       bool,
        "has_steps":      bool,
        "contains_table": bool,
    }
    """
    all_tags: set[str] = set()
    has_video = has_code = has_steps = contains_table = False

    for chunk in chunks:
        m = chunk.metadata
        if m.get("has_video"):
            has_video = True
        if m.get("has_code"):
            has_code = True
        if m.get("has_steps"):
            has_steps = True
        if m.get("contains_table"):
            contains_table = True

        tags_raw = m.get("tags")
        if isinstance(tags_raw, str) and tags_raw:
            all_tags.update(t.strip() for t in tags_raw.split(",") if t.strip())
        elif isinstance(tags_raw, list):
            all_tags.update(t for t in tags_raw if isinstance(t, str) and t.strip())

    return {
        "tags": sorted(all_tags),
        "has_video": has_video,
        "has_code": has_code,
        "has_steps": has_steps,
        "contains_table": contains_table,
    }


class IngestionService:
    """文档摄取服务：解析 + 向量化 + 写入 + 元数据清单生成。"""

    def __init__(self, store: VectorStore) -> None:
        self._store = store

    def run(self, docs_dir: str | None = None) -> dict[str, Any]:
        """执行完整摄取流程，返回统计字典。

        流程：
          1. 解析文档目录（.md / .pdf / .docx）
          2. 向量化并写入 Qdrant
          3. 生成 metadata_catalog.json 供意图过滤使用
        """
        root = Path(docs_dir or config.DOCS_DIR)
        if not root.exists():
            raise FileNotFoundError(f"找不到 docs 目录: {root}")

        # ── Ollama 可用性预检 ──────────────────────────────────────────────
        if not _is_ollama_healthy(config.OLLAMA_BASE_URL):
            raise RuntimeError(
                f"Ollama 向量化服务不可用（{config.OLLAMA_BASE_URL}），"
                f"请确认 Ollama 已启动且模型 {config.EMBED_MODEL!r} 已加载（ollama pull {config.EMBED_MODEL}）。"
            )

        documents = parse_docs_directory(root)
        all_chunks: list[Chunk] = [c for doc in documents for c in doc.chunks]

        # 将 SQLite KU 元数据注入匹配的 chunk（按文件名匹配）
        try:
            ku_by_filename: dict[str, Any] = {
                ku["filename"]: ku for ku in ku_store.list_kus()
            }
            for chunk in all_chunks:
                fname = Path(chunk.source).name
                ku = ku_by_filename.get(fname)
                if ku:
                    chunk.metadata["kuid"] = ku["kuid"]
                    chunk.metadata["project_name"] = ku.get("project_name", "") or ""
                    ku_tags = ku.get("tags", "") or ""
                    if ku_tags:
                        existing = chunk.metadata.get("tags") or ""
                        combined = ", ".join(
                            t for t in dict.fromkeys(
                                [s.strip() for s in (existing + ", " + ku_tags).split(",") if s.strip()]
                            )
                        )
                        chunk.metadata["tags"] = combined
        except Exception as exc:  # noqa: BLE001
            print(f"[IngestionService] KU 元数据注入失败，已跳过: {exc}")

        total_docs = self._store.write(all_chunks, recreate=True)

        # ── 生成并持久化元数据清单 ─────────────────────────────────────────
        catalog = _build_metadata_catalog(all_chunks)
        catalog_path = Path(config.METADATA_CATALOG_PATH)
        catalog_path.parent.mkdir(parents=True, exist_ok=True)
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")

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
            "catalog_tags": len(catalog["tags"]),
        }
