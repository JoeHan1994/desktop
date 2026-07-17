"""HTTP 接口层：FastAPI 应用。

对外暴露 embedding / rerank / 文档摄取 / RAG 问答接口，供 Rust (Tauri)
后端通过本地 HTTP 调用。所有重型模型均惰性加载。
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..domain import SearchResult
from .container import container

app = FastAPI(title="Terraforge Sidecar", version="1.0.0")

# ── CORS（Tauri webview 视为跨域请求，必须显式放行）─────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 仅本地 sidecar，无需限制来源
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 请求模型 ───────────────────────────────────────────────────────────────
class EmbedRequest(BaseModel):
    text: str


class EmbedBatchRequest(BaseModel):
    texts: list[str]


class RerankCandidate(BaseModel):
    id: str = ""
    text: str
    title: str = ""
    vector_score: float = 0.0


class RerankRequest(BaseModel):
    query: str
    candidates: list[RerankCandidate]
    top_n: int = 3
    prob_threshold: float = 0.05


class IngestRequest(BaseModel):
    docs_dir: str | None = None


class QaMessage(BaseModel):
    role: str
    content: str


class QaTraceRequest(BaseModel):
    question: str


class QaAskRequest(BaseModel):
    question: str
    history: list[QaMessage] = []


# ── 路由 ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/embed")
def embed(req: EmbedRequest) -> dict[str, list[float]]:
    try:
        vector = container.embedder.embed(req.text)
    except Exception as exc:  # noqa: BLE001 - 边界层统一转 HTTP 错误
        raise HTTPException(status_code=502, detail=f"Embedding 失败: {exc}") from exc
    return {"vector": vector}


@app.post("/embed/batch")
def embed_batch(req: EmbedBatchRequest) -> dict[str, list[list[float]]]:
    try:
        vectors = container.embedder.embed_batch(req.texts)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Embedding 失败: {exc}") from exc
    return {"vectors": vectors}


@app.post("/rerank")
def rerank(req: RerankRequest) -> dict[str, list[dict[str, Any]]]:
    candidates = [
        SearchResult(
            id=c.id,
            text=c.text,
            source="",
            score=c.vector_score,
            metadata={"title": c.title},
        )
        for c in req.candidates
    ]
    try:
        results = container.reranker.rerank(
            req.query,
            candidates,
            top_n=req.top_n,
            prob_threshold=req.prob_threshold,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Rerank 失败: {exc}") from exc
    return {
        "results": [
            {
                "id": r.result.id,
                "rerank_score": r.rerank_score,
                "prob": r.prob,
                "vector_score": r.vector_score,
            }
            for r in results
        ]
    }


@app.post("/ingest/docs")
def ingest_docs(req: IngestRequest) -> dict[str, Any]:
    try:
        return container.ingestion_service.run(req.docs_dir)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"摄取失败: {exc}") from exc


@app.post("/qa/trace")
def qa_trace(req: QaTraceRequest) -> dict[str, Any]:
    """RAG 管道追踪：返回向量检索、精排、上下文构建各步骤的中间数据，不含 LLM 生成。"""
    try:
        return container.qa_service.trace_pipeline(req.question)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Trace 失败: {exc}") from exc


@app.post("/qa/ask")
def qa_ask(req: QaAskRequest) -> StreamingResponse:
    history = [m.model_dump() for m in req.history]

    def event_stream():
        try:
            for delta in container.qa_service.ask(req.question, history):
                yield delta
        except Exception as exc:  # noqa: BLE001
            yield f"\n[错误] {exc}"

    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")
