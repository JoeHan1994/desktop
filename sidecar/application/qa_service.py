"""应用服务：RAG 问答流程编排（对应流程图阶段二）。

流程：
  步骤 2  翻译   - LlmService.translate()       将用户问题翻译为英文
  步骤 3  过滤   - LlmService.extract_filters()  意图解析，提取元数据过滤参数（YAML 提示词 1）
  步骤 4  嵌入   - ChromaStore 内部通过 OllamaEmbedder 向量化英文问题
  步骤 5  检索   - ChromaStore.search()          向量检索 + Metadata 过滤
  步骤 6  生成   - ChatOllama.stream()            整合上下文，格式化答案（YAML 提示词 2）
  步骤 7  返回   - 流式 yield 文本增量
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from ..domain import SearchResult
from ..infrastructure import config
from ..infrastructure.llm_service import LlmService
from ..infrastructure.vector_store import VectorStore

RETRIEVE_K = 8


class QaService:
    """基于向量检索 + LLM 的文档问答服务（流程图阶段二）。"""

    def __init__(
        self,
        store: VectorStore,
        llm_service: LlmService,
        model: str = config.LLM_MODEL,
        base_url: str = config.OLLAMA_BASE_URL,
    ) -> None:
        self._store = store
        self._llm_service = llm_service
        self._llm = ChatOllama(model=model, base_url=base_url, reasoning=False)

    def ask(self, question: str) -> Iterator[str]:
        """流式回答用户问题，按流程图逐步执行并 yield 文本增量。

        若向量库无相关文档，回退到直接 LLM 问答。
        """
        # ── 步骤 2：翻译（检测到中文时调用 LLM）─────────────────────────────
        question_en = self._llm_service.translate(question)

        # ── 步骤 3：意图解析 & 过滤提取（YAML 提示词 1）─────────────────────
        filters = self._llm_service.extract_filters(question_en)

        # ── 步骤 4+5：向量化 + 检索 + Metadata 过滤 ─────────────────────────
        docs = self._store.search(question_en, k=RETRIEVE_K, filters=filters)

        if not docs:
            # 无相关文档：回退到普通对话模式
            for chunk in self._llm.stream(question):
                yield str(chunk.content)
            return

        # ── 步骤 6：整合上下文 + 格式化答案（YAML 提示词 2）─────────────────
        context = self._build_context(docs)
        answer_prompt = self._llm_service.answer_prompt
        system = answer_prompt["system"]
        user_text = answer_prompt["user_template"].format(
            context=context,
            question=question,
        )
        messages: list[Any] = [
            SystemMessage(content=system),
            HumanMessage(content=user_text),
        ]
        for chunk in self._llm.stream(messages):
            yield str(chunk.content)

    @staticmethod
    def _build_context(docs: list[SearchResult]) -> str:
        """把检索片段拼成带来源/关联信息的上下文文本（供 YAML 提示词 2 使用）。"""
        parts: list[str] = []
        for i, doc in enumerate(docs):
            m = doc.metadata
            header = f"[Source: {doc.source} | Section: {m.get('title', doc.source)}]"
            related = (
                f"\n  Related docs: {m['related_docs']}" if m.get("related_docs") else ""
            )
            video = (
                f"\n  Video URL: {m['video_links']}" if m.get("video_links") else ""
            )
            parts.append(f"--- Fragment {i + 1} {header}{related}{video}\n{doc.text}")
        return "\n\n".join(parts)

    def trace(self, question: str) -> dict[str, Any]:
        """执行完整 RAG 流程并返回每步的追踪数据（不含 LLM 生成）。

        前端先调用此接口获取 retrieve / rerank / context 步骤详情，
        再单独调用 /qa/ask 流式获取 LLM 回答。
        """
        steps: list[dict[str, Any]] = []
        fallback_mode = False

        # ── retrieve ─────────────────────────────────────────────────────
        t0 = time.perf_counter()
        question_en = self._llm_service.translate(question)
        filters = self._llm_service.extract_filters(question_en)
        docs = self._store.search(question_en, k=RETRIEVE_K, filters=filters)
        retrieve_ms = (time.perf_counter() - t0) * 1000

        steps.append({
            "step_id": "retrieve",
            "name": "向量检索",
            "duration_ms": round(retrieve_ms, 1),
            "status": "done",
            "summary": f"检索到 {len(docs)} 个候选文档（查询: {question_en!r}）",
            "data": {
                "query": question_en,
                "k": RETRIEVE_K,
                "hit_count": len(docs),
                "candidates": [
                    {
                        "id": d.id,
                        "text": d.text,
                        "source": d.source,
                        "score": round(d.score, 4),
                        "title": d.metadata.get("title", d.source),
                        "metadata": d.metadata,
                    }
                    for d in docs
                ],
            },
        })

        # ── rerank（当前未启用，标记为 skipped）────────────────────────────
        steps.append({
            "step_id": "rerank",
            "name": "精排重排",
            "duration_ms": 0,
            "status": "skipped",
            "summary": "重排序器未启用",
            "data": {
                "prob_threshold": 0.05,
                "top_n": 3,
                "input_count": len(docs),
                "output_count": 0,
                "all_ranked": [],
                "selected_ids": [],
                "skipped": True,
                "reason": "reranker 未启用",
            },
        })

        # ── context ──────────────────────────────────────────────────────
        if not docs:
            fallback_mode = True
            steps.append({
                "step_id": "context",
                "name": "构建上下文",
                "duration_ms": 0,
                "status": "skipped",
                "summary": "无相关文档，将切换为直接 LLM 问答模式",
                "data": {
                    "source_count": 0,
                    "context": "",
                    "system_prompt": "",
                    "sources": [],
                    "fallback_mode": True,
                },
            })
        else:
            t0 = time.perf_counter()
            context = self._build_context(docs)
            system_prompt = self._llm_service.answer_prompt.get("system", "")
            context_ms = (time.perf_counter() - t0) * 1000

            steps.append({
                "step_id": "context",
                "name": "构建上下文",
                "duration_ms": round(context_ms, 1),
                "status": "done",
                "summary": f"整合 {len(docs)} 个来源片段",
                "data": {
                    "source_count": len(docs),
                    "context": context,
                    "system_prompt": system_prompt,
                    "sources": [
                        {"source": d.source, "title": d.metadata.get("title", d.source)}
                        for d in docs
                    ],
                    "fallback_mode": False,
                },
            })

        return {
            "question": question,
            "steps": steps,
            "fallback_mode": fallback_mode,
        }
