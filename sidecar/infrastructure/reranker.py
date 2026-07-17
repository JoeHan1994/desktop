"""Reranker 基础设施：封装 bge-reranker-v2-m3 交叉编码器精排。

两阶段检索的第二阶段：对向量粗召回的候选逐一打分，比向量距离更可靠。
首次加载会自动下载模型（约 1.1GB），缓存至 config.HF_CACHE_DIR。
"""

from __future__ import annotations

import os

# 在导入 transformers 之前指定 HF 缓存目录
from . import config

os.environ.setdefault("HF_HOME", config.HF_CACHE_DIR)

import torch  # noqa: E402
from transformers import (  # noqa: E402
    AutoModelForSequenceClassification,
    AutoTokenizer,
)

from ..domain import RerankResult, SearchResult  # noqa: E402


class BgeReranker:
    """bge-reranker-v2-m3 跨语言重排序器（CPU 推理）。"""

    def __init__(self, model_name: str = config.RERANKER_MODEL) -> None:
        self._tokenizer = AutoTokenizer.from_pretrained(model_name)
        self._model = AutoModelForSequenceClassification.from_pretrained(model_name)
        self._model.eval()

    def rerank(
        self,
        query: str,
        candidates: list[SearchResult],
        top_n: int = 3,
        prob_threshold: float = 0.05,
    ) -> list[RerankResult]:
        """对候选集精排，剔除相关概率低于阈值的项后取前 top_n 个。

        把章节标题拼进正文再送 Reranker：正文里往往缺少像 "Assign Session"
        这样的强主题信号，补上标题能提升主题匹配准确度。
        """
        if not candidates:
            return []

        pairs = [
            [query, f"{c.metadata.get('title', '')}\n\n{c.text}"] for c in candidates
        ]
        with torch.no_grad():
            inputs = self._tokenizer(
                pairs,
                padding=True,
                truncation=True,
                return_tensors="pt",
                max_length=512,
            )
            logits = self._model(**inputs, return_dict=True).logits.view(-1).float()
            scores = logits.tolist()
            probs = torch.sigmoid(logits).tolist()

        ranked = sorted(
            (
                RerankResult(
                    result=candidates[i],
                    rerank_score=scores[i],
                    prob=probs[i],
                    vector_score=candidates[i].score,
                )
                for i in range(len(candidates))
            ),
            key=lambda r: r.rerank_score,
            reverse=True,
        )

        passing = [r for r in ranked if r.prob > prob_threshold]
        return passing[:top_n]
