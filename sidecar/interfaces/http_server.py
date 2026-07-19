"""HTTP 接口层：FastAPI 应用（对应流程图两个阶段的 API 入口）。

阶段一  /ingest/*      文档入库：检测格式 → 切块 → 元数据 → 向量写入
阶段二  /qa/ask        问答：翻译 → 意图过滤 → 向量检索 → LLM 生成 → 流式返回
附加    /vectordb/*    向量库浏览（Chroma & Qdrant）
附加    /pipeline/*    KU 管理 + 文档预处理流水线（SSE 进度流）

所有重型模型均惰性加载，服务启动不阻塞。
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .container import container
from ..infrastructure import ku_store

app = FastAPI(title="Terraforge Sidecar", version="2.0.0")

# ── CORS（Tauri webview 视为跨域请求，必须显式放行）─────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 请求 / 响应模型 ────────────────────────────────────────────────────────

class IngestDirRequest(BaseModel):
    """阶段一：扫描目录入库。"""
    docs_dir: str | None = None


class QaAskRequest(BaseModel):
    """阶段二：问答请求（单轮，符合流程图定义）。"""
    question: str


# ── 公共接口 ───────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    """健康探针，供 Tauri 后端检测 sidecar 是否就绪。"""
    return {"status": "ok"}


# ── 阶段一：数据预处理与入库流程 ──────────────────────────────────────────

@app.post("/ingest/docs")
def ingest_docs(req: IngestDirRequest) -> dict[str, Any]:
    """扫描指定目录，按文件格式（.md / .pdf / .docx）解析并写入向量库。

    返回统计信息：文件数、切块数、各内容类型数量。
    """
    try:
        return container.ingestion_service.run(req.docs_dir)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"入库失败: {exc}") from exc


@app.post("/ingest/file")
async def ingest_file(file: UploadFile = File(...)) -> dict[str, Any]:
    """上传单个文件并立即入库（支持 .md / .pdf / .docx）。

    文件写入临时目录后调用通用入库流程，完成后删除临时文件。
    """
    import tempfile, shutil

    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in {".md", ".pdf", ".docx"}:
        raise HTTPException(
            status_code=415,
            detail=f"不支持的文件格式: {suffix}，仅接受 .md / .pdf / .docx",
        )
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir) / (file.filename or f"upload{suffix}")
            content = await file.read()
            tmp_path.write_bytes(content)
            return container.ingestion_service.run(tmp_dir)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"文件入库失败: {exc}") from exc


# ── 阶段二：用户查询与 RAG 检索生成流程 ──────────────────────────────────

@app.post("/qa/ask")
def qa_ask(req: QaAskRequest) -> StreamingResponse:
    """流程图阶段二完整流程：翻译 → 意图过滤 → 向量检索 → LLM 生成 → 流式返回。

    响应为 text/plain 流式输出，前端可逐块渲染。
    """
    def event_stream():
        try:
            for delta in container.qa_service.ask(req.question):
                yield delta
        except Exception as exc:  # noqa: BLE001
            yield f"\n[错误] {exc}"

    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")


@app.post("/qa/trace")
def qa_trace(req: QaAskRequest) -> dict[str, Any]:
    """RAG 流程追踪：执行 retrieve / rerank / context 步骤并返回详细数据。

    前端先调用此接口获取各步骤耗时与候选文档，再单独调用 /qa/ask 流式获取 LLM 回答。
    """
    try:
        return container.qa_service.trace(req.question)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"追踪失败: {exc}") from exc


# ── 向量库浏览 ─────────────────────────────────────────────────────────────

@app.get("/vectordb/overview")
def vectordb_overview() -> dict[str, Any]:
    """返回当前活跃向量后端（chroma / qdrant）及基础统计。"""
    store = container.vector_store
    backend = store._backend  # type: ignore[attr-defined]
    collection = store._collection  # type: ignore[attr-defined]

    result: dict[str, Any] = {"backend": backend, "collection": collection}

    try:
        if backend == "qdrant":
            client = store._qdrant_client  # type: ignore[attr-defined]
            collections = [c.name for c in client.get_collections().collections]
            result["collections"] = collections
            if collection in collections:
                result["vector_count"] = client.count(collection).count
                info = client.get_collection(collection)
                result["dimension"] = (
                    info.config.params.vectors.size  # type: ignore[union-attr]
                    if hasattr(info.config.params.vectors, "size")
                    else None
                )
            else:
                result["vector_count"] = 0
        else:
            client = store._chroma_client  # type: ignore[attr-defined]
            collections = [c.name for c in client.list_collections()]
            result["collections"] = collections
            if collection in collections:
                result["vector_count"] = client.get_collection(collection).count()
            else:
                result["vector_count"] = 0
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)

    # SQLite 统计
    try:
        result["sqlite"] = ku_store.db_stats()
    except Exception:
        result["sqlite"] = {"ku_count": 0, "chunk_count": 0}

    return result


@app.get("/vectordb/items")
def vectordb_items(
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default=""),
) -> dict[str, Any]:
    """浏览向量库中存储的文档块。

    返回 items（id / text / source / metadata）+ total 总数。
    """
    store = container.vector_store
    backend = store._backend  # type: ignore[attr-defined]
    collection = store._collection  # type: ignore[attr-defined]

    try:
        if backend == "qdrant":
            client = store._qdrant_client  # type: ignore[attr-defined]
            from qdrant_client.models import Filter, ScrollRequest  # type: ignore

            result_points, _next = client.scroll(
                collection_name=collection,
                limit=limit,
                offset=offset if offset > 0 else None,
                with_payload=True,
                with_vectors=False,
            )
            total = client.count(collection).count
            items = [
                {
                    "id": str(pt.id),
                    "text": (pt.payload or {}).get("page_content", ""),
                    "source": (pt.payload or {}).get("source", ""),
                    "metadata": {
                        k: v for k, v in (pt.payload or {}).items()
                        if k not in ("page_content",)
                    },
                }
                for pt in result_points
            ]
        else:
            client = store._chroma_client  # type: ignore[attr-defined]
            col = client.get_collection(collection)
            total = col.count()
            raw = col.get(limit=limit, offset=offset, include=["documents", "metadatas"])
            items = [
                {
                    "id": raw["ids"][i],
                    "text": (raw["documents"] or [])[i] if raw.get("documents") else "",
                    "source": ((raw["metadatas"] or [])[i] or {}).get("source", "") if raw.get("metadatas") else "",
                    "metadata": (raw["metadatas"] or [])[i] or {} if raw.get("metadatas") else {},
                }
                for i in range(len(raw["ids"]))
            ]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"backend": backend, "total": total, "offset": offset, "limit": limit, "items": items}


@app.delete("/vectordb/collection")
def vectordb_delete_collection(also_sqlite: bool = Query(default=False)) -> dict[str, Any]:
    """清空向量库（删除全部向量）。

    also_sqlite=true 时同步清空 SQLite KU / chunk 表。
    """
    try:
        container.vector_store.delete_all()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    result: dict[str, Any] = {"vector_store": "cleared"}
    if also_sqlite:
        try:
            ku_store.clear_all()
            result["sqlite"] = "cleared"
        except Exception as exc:  # noqa: BLE001
            result["sqlite"] = f"error: {exc}"
    return result


# ── KU 管理 ───────────────────────────────────────────────────────────────

class KuCreateRequest(BaseModel):
    filename: str
    filepath: str
    project_name: str = ""
    tags: str = ""


@app.post("/pipeline/ku")
def pipeline_create_ku(req: KuCreateRequest) -> dict[str, Any]:
    """创建或更新 KU 记录，返回 kuid。"""
    kuid = ku_store.upsert_ku(
        filename=req.filename,
        filepath=req.filepath,
        project_name=req.project_name,
        tags=req.tags,
    )
    row = ku_store.get_ku(kuid) or {}
    return row


@app.get("/pipeline/kus")
def pipeline_list_kus() -> list[dict[str, Any]]:
    """返回全部 KU 列表（含 chunk 统计）。"""
    return ku_store.list_kus()


@app.delete("/pipeline/ku/{kuid}")
def pipeline_delete_ku(kuid: str) -> dict[str, str]:
    """删除 KU 及其关联 chunk 记录。"""
    ku_store.delete_ku(kuid)
    return {"deleted": kuid}


@app.get("/pipeline/chunks/{kuid}")
def pipeline_list_chunks(kuid: str) -> list[dict[str, Any]]:
    """返回某 KU 下的 chunk 列表。"""
    return ku_store.list_chunks(kuid)


# ── 文档预处理流水线（SSE 进度流）────────────────────────────────────────

class PipelineRunRequest(BaseModel):
    filepath: str          # .md 文件路径 或 包含 .md 的目录路径
    project_name: str = ""
    tags: str = ""
    docs_root: str = ""    # 计算相对路径用，留空则自动推断


@app.post("/pipeline/run")
def pipeline_run(req: PipelineRunRequest) -> StreamingResponse:
    """执行文档预处理流水线，支持单文件或整个目录，以 SSE 格式逐步返回进度。

    Event 格式：每行 "data: {json}\\n\\n"
    事件字段：step, status (running|done|error), message, data,
              file_index (当前文件序号，0-based), total_files, current_file (文件名)
    """

    def _event(
        step: str,
        status: str,
        message: str,
        data: dict | None = None,
        file_index: int = 0,
        total_files: int = 1,
        current_file: str = "",
    ) -> str:
        payload = json.dumps(
            {
                "step": step,
                "status": status,
                "message": message,
                "data": data or {},
                "file_index": file_index,
                "total_files": total_files,
                "current_file": current_file,
            },
            ensure_ascii=False,
        )
        return f"data: {payload}\n\n"

    def _process_one(
        filepath: Path,
        docs_root: Path,
        file_index: int,
        total_files: int,
    ):
        """处理单个 .md 文件，yield SSE 事件。"""
        filename = filepath.name
        ev = lambda step, status, msg, d=None: _event(  # noqa: E731
            step, status, msg, d, file_index, total_files, filename
        )

        # Step 1 – KU
        yield ev("ku", "running", f"[{filename}] 正在创建 KU 记录…")
        try:
            kuid = ku_store.upsert_ku(
                filename=filename,
                filepath=str(filepath),
                project_name=req.project_name,
                tags=req.tags,
            )
            ku_row = ku_store.get_ku(kuid) or {}
            yield ev("ku", "done", f"[{filename}] KU 已创建/更新，KUID: {kuid[:8]}…", ku_row)
        except Exception as exc:  # noqa: BLE001
            yield ev("ku", "error", f"[{filename}] KU 创建失败: {exc}")
            return

        # Step 2 – Parse & chunk
        yield ev("parse", "running", f"[{filename}] 正在解析 Markdown 并切块…")
        try:
            from ..infrastructure.parsers.markdown_parser import (
                parse_markdown_file,
                compute_idf,
            )
            idf = compute_idf([filepath])
            doc = parse_markdown_file(filepath, docs_root, idf)
            chunks = doc.chunks
            yield ev(
                "parse", "done",
                f"[{filename}] 切块完成，共 {len(chunks)} 个 chunk",
                {"chunk_count": len(chunks), "source": doc.source},
            )
        except Exception as exc:  # noqa: BLE001
            yield ev("parse", "error", f"[{filename}] 解析失败: {exc}")
            return

        # 删除向量库中该 source 的旧向量，避免重复入库
        try:
            container.vector_store.delete_by_source(doc.source)
        except Exception:  # noqa: BLE001
            pass  # 集合尚不存在时忽略

        # 将 KU 元数据注入各 chunk，供向量库检索与展示使用
        for chunk in chunks:
            chunk.metadata["kuid"] = kuid
            chunk.metadata["project_name"] = ku_row.get("project_name", "")
            # 用户手动设置的 KU 标签优先追加到 TF-IDF 标签之后
            ku_tags = ku_row.get("tags", "")
            if ku_tags:
                existing = chunk.metadata.get("tags") or ""
                combined = ", ".join(
                    t for t in dict.fromkeys(
                        [s.strip() for s in (existing + ", " + ku_tags).split(",") if s.strip()]
                    )
                )
                chunk.metadata["tags"] = combined

        # Step 3 – Embed & write vector DB
        yield ev("embed", "running", f"[{filename}] 正在向量化并写入向量库…")
        try:
            from ..infrastructure.embedder import _is_ollama_healthy
            from ..infrastructure import config as cfg
            if not _is_ollama_healthy(cfg.OLLAMA_BASE_URL):
                yield ev("embed", "error", f"Ollama 不可用 ({cfg.OLLAMA_BASE_URL})")
                return
            total_docs = container.vector_store.write(chunks, recreate=False)
            yield ev(
                "embed", "done",
                f"[{filename}] 向量库写入完成，集合总量: {total_docs}",
                {"total_docs": total_docs},
            )
        except Exception as exc:  # noqa: BLE001
            yield ev("embed", "error", f"[{filename}] 向量化失败: {exc}")
            return

        # Step 4 – SQLite chunk table
        yield ev("sqlite", "running", f"[{filename}] 正在将 chunk 元数据写入 SQLite…")
        try:
            ku_store.clear_chunks(kuid)
            for i, chunk in enumerate(chunks):
                chunk_id = chunk.metadata.get("chunk_id")
                cid = f"{kuid}_{chunk_id}" if chunk_id is not None else f"{kuid}_{i}"
                ku_store.insert_chunk(chunk_id=cid, kuid=kuid, raw_text=chunk.text)
            yield ev(
                "sqlite", "done",
                f"[{filename}] SQLite 写入完成，共 {len(chunks)} 条 chunk 记录",
                {"chunk_count": len(chunks), "kuid": kuid},
            )
        except Exception as exc:  # noqa: BLE001
            yield ev("sqlite", "error", f"[{filename}] SQLite 写入失败: {exc}")
            return

        yield ev(
            "file_done", "done",
            f"[{filename}] ✓ 完成 ({file_index + 1}/{total_files})",
            {"kuid": kuid, "chunk_count": len(chunks)},
        )

    def stream():
        target = Path(req.filepath)
        if not target.exists():
            yield _event("init", "error", f"路径不存在: {req.filepath}")
            return

        # ── 收集待处理文件 ────────────────────────────────────────────────
        if target.is_dir():
            md_files = sorted(target.rglob("*.md"))
            if not md_files:
                yield _event("init", "error", f"目录中未找到任何 .md 文件: {target}")
                return
            docs_root = target
        elif target.is_file():
            if target.suffix.lower() != ".md":
                yield _event("init", "error", "仅支持 .md 文件或包含 .md 的文件夹")
                return
            md_files = [target]
            docs_root = Path(req.docs_root) if req.docs_root else target.parent
        else:
            yield _event("init", "error", f"不支持的路径类型: {req.filepath}")
            return

        total = len(md_files)
        yield _event(
            "scan", "done",
            f"扫描完成，共发现 {total} 个 .md 文件",
            {"total_files": total, "files": [f.name for f in md_files]},
            total_files=total,
        )

        for idx, fp in enumerate(md_files):
            yield _event(
                "file_start", "running",
                f"开始处理 [{idx + 1}/{total}]: {fp.name}",
                {"filename": fp.name},
                file_index=idx,
                total_files=total,
                current_file=fp.name,
            )
            yield from _process_one(fp, docs_root, idx, total)

        yield _event(
            "finish", "done",
            f"全部 {total} 个文件处理完毕 ✓",
            {"total_files": total},
            total_files=total,
        )

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
