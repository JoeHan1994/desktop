"""应用服务：RAG 问答流程编排。

向量粗召回 → Reranker 精排 → 构建上下文 → 调用 LLM 流式生成。
无相关文档时回退到普通对话模式，避免用无关内容误导 LLM。
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from ..domain import RerankResult, SearchResult
from ..infrastructure import config
from ..infrastructure.reranker import BgeReranker
from ..infrastructure.vector_store import QdrantStore

# 检索参数
RETRIEVE_K = 12
RERANK_PROB_THRESHOLD = 0.05
RERANK_TOP_N = 3

_SYSTEM_PROMPT = """你是 Terraforge 产品文档助手。请根据检索到的文档片段回答用户的问题。

要求：
1. 请用中文回答。
2. 在作答之前，请先阅读检索到的文档片段，确保回答基于文档内容，而不是凭记忆或假设。
3. 在作答之前，请先思考是否有先决条件，以及当前行为的影响，如果没有不在回答中提及。
4. 如果文档中有关联的视频或者文档链接，请在回答中提及。
5. 如果文档中没有明确答案，请如实说明不知道，不要编造答案。"""


class QaService:
    """基于向量检索 + Reranker + Ollama LLM 的文档问答服务。"""

    def __init__(
        self,
        store: QdrantStore,
        reranker: BgeReranker,
        model: str = config.LLM_MODEL,
        base_url: str = config.OLLAMA_BASE_URL,
    ) -> None:
        self._store = store
        self._reranker = reranker
        self._llm = ChatOllama(model=model, base_url=base_url, reasoning=False)

    def retrieve(self, question: str) -> list[RerankResult]:
        """粗召回 + 精排，返回最终采用的相关片段（可能为空）。"""
        candidates = self._store.search(question, k=RETRIEVE_K)
        if not candidates:
            return []
        return self._reranker.rerank(
            question,
            candidates,
            top_n=RERANK_TOP_N,
            prob_threshold=RERANK_PROB_THRESHOLD,
        )

    def ask(
        self, question: str, history: list[dict[str, Any]] | None = None
    ) -> Iterator[str]:
        """流式回答问题，逐段 yield 文本增量。

        history 为历史对话（[{role, content}, ...]），当前实现聚焦单轮 RAG，
        历史用于上下文延续（附加在系统提示之后）。
        """
        relevant = self.retrieve(question)

        if not relevant:
            # 无相关文档：回退到普通对话模式
            for chunk in self._llm.stream(question):
                yield str(chunk.content)
            return

        context = self._build_context([r.result for r in relevant])
        user_prompt = f"检索到的文档片段：\n{context}\n\n用户问题：{question}"

        messages: list[Any] = [SystemMessage(content=_SYSTEM_PROMPT)]
        for turn in history or []:
            role = turn.get("role")
            content = str(turn.get("content", ""))
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(SystemMessage(content=f"（历史回答）{content}"))
        messages.append(HumanMessage(content=user_prompt))

        for chunk in self._llm.stream(messages):
            yield str(chunk.content)

    def trace_pipeline(self, question: str) -> dict[str, Any]:
        """运行 RAG 管道各步骤，返回结构化追踪数据（不含 LLM 生成）。

        前端可用此接口可视化每个执行步骤的中间数据；LLM 生成通过
        现有的 /qa/ask 流式接口单独调用。
        """

        def _safe_meta(m: dict[str, Any]) -> dict[str, Any]:
            """去除内部字段，确保 JSON 可序列化。"""
            safe: dict[str, Any] = {}
            for k, v in m.items():
                if k.startswith("_") or k == "page_content":
                    continue
                if isinstance(v, (str, int, float, bool, list, type(None))):
                    safe[k] = v
                else:
                    safe[k] = str(v)
            return safe

        steps: list[dict[str, Any]] = []

        # ── 步骤 1：向量粗召回 ─────────────────────────────────────────────
        t0 = time.perf_counter()
        candidates = self._store.search(question, k=RETRIEVE_K)
        retrieve_ms = (time.perf_counter() - t0) * 1000

        steps.append(
            {
                "step_id": "retrieve",
                "name": "向量粗召回",
                "duration_ms": round(retrieve_ms, 1),
                "status": "done",
                "summary": f"命中 {len(candidates)} 条候选 (k={RETRIEVE_K})",
                "data": {
                    "query": question,
                    "k": RETRIEVE_K,
                    "hit_count": len(candidates),
                    "candidates": [
                        {
                            "id": c.id,
                            "text": c.text,
                            "source": c.source,
                            "score": round(c.score, 4),
                            "title": str(c.metadata.get("title", "") or ""),
                            "metadata": _safe_meta(c.metadata),
                        }
                        for c in candidates
                    ],
                },
            }
        )

        fallback_mode = not bool(candidates)
        final_docs: list[SearchResult] = []

        # ── 步骤 2：Reranker 精排 ──────────────────────────────────────────
        if candidates:
            t0 = time.perf_counter()
            # 用 prob_threshold=0.0 获取全部排序结果，便于可视化过滤过程
            all_ranked = self._reranker.rerank(
                question,
                candidates,
                top_n=len(candidates),
                prob_threshold=0.0,
            )
            rerank_ms = (time.perf_counter() - t0) * 1000

            passing = [r for r in all_ranked if r.prob > RERANK_PROB_THRESHOLD]
            selected = passing[:RERANK_TOP_N]
            final_docs = [r.result for r in selected]
            selected_ids = {r.result.id for r in selected}

            steps.append(
                {
                    "step_id": "rerank",
                    "name": "Reranker 精排",
                    "duration_ms": round(rerank_ms, 1),
                    "status": "done",
                    "summary": (
                        f"{len(candidates)} → {len(selected)} 条"
                        f"（阈值 prob>{RERANK_PROB_THRESHOLD}，top-{RERANK_TOP_N}）"
                    ),
                    "data": {
                        "prob_threshold": RERANK_PROB_THRESHOLD,
                        "top_n": RERANK_TOP_N,
                        "input_count": len(candidates),
                        "output_count": len(selected),
                        "all_ranked": [
                            {
                                "id": r.result.id,
                                "text": r.result.text[:400],
                                "source": r.result.source,
                                "title": str(r.result.metadata.get("title", "") or ""),
                                "rerank_score": round(r.rerank_score, 4),
                                "prob": round(r.prob, 4),
                                "vector_score": round(r.vector_score, 4),
                                "passed": r.prob > RERANK_PROB_THRESHOLD,
                                "selected": r.result.id in selected_ids,
                            }
                            for r in all_ranked
                        ],
                        "selected_ids": list(selected_ids),
                    },
                }
            )
        else:
            steps.append(
                {
                    "step_id": "rerank",
                    "name": "Reranker 精排",
                    "duration_ms": 0,
                    "status": "skipped",
                    "summary": "无候选，已跳过",
                    "data": {
                        "skipped": True,
                        "reason": "向量库无匹配结果",
                        "input_count": 0,
                        "output_count": 0,
                        "all_ranked": [],
                        "prob_threshold": RERANK_PROB_THRESHOLD,
                        "top_n": RERANK_TOP_N,
                    },
                }
            )

        # ── 步骤 3：上下文构建 ─────────────────────────────────────────────
        if final_docs:
            context = QaService._build_context(final_docs)
            steps.append(
                {
                    "step_id": "context",
                    "name": "上下文构建",
                    "duration_ms": 0,
                    "status": "done",
                    "summary": f"拼接 {len(final_docs)} 个片段，{len(context)} 字符",
                    "data": {
                        "source_count": len(final_docs),
                        "context": context,
                        "system_prompt": _SYSTEM_PROMPT,
                        "sources": [
                            {
                                "source": d.source,
                                "title": str(d.metadata.get("title", "") or ""),
                            }
                            for d in final_docs
                        ],
                    },
                }
            )
        else:
            steps.append(
                {
                    "step_id": "context",
                    "name": "上下文构建",
                    "duration_ms": 0,
                    "status": "skipped",
                    "summary": (
                        "回退到直接对话模式" if fallback_mode else "无文档通过过滤"
                    ),
                    "data": {
                        "fallback_mode": True,
                        "source_count": 0,
                        "context": "",
                        "system_prompt": _SYSTEM_PROMPT,
                        "sources": [],
                    },
                }
            )

        return {
            "question": question,
            "steps": steps,
            "fallback_mode": fallback_mode,
        }

    @staticmethod
    def _build_context(docs: list[SearchResult]) -> str:
        """把检索片段拼成带来源/关联信息的上下文文本。"""
        parts: list[str] = []
        for i, doc in enumerate(docs):
            m = doc.metadata
            header = f"[来源: {doc.source} | 章节: {m.get('title', doc.source)}]"
            related = (
                f"\n  关联文档: {m['related_docs']}" if m.get("related_docs") else ""
            )
            video = f"\n  演示视频: {m['video_links']}" if m.get("video_links") else ""
            parts.append(f"--- 片段 {i + 1} {header}{related}{video}\n{doc.text}")
        return "\n\n".join(parts)
