"""领域模型：检索与重排序结果。

纯数据结构，供向量检索、Reranker 精排以及问答上下文构建共享。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class SearchResult:
    """向量库粗召回的单条结果。

    score 为向量相似度（Qdrant 余弦相似度，0~1，越大越相关）。
    """

    id: str
    text: str
    source: str
    score: float
    metadata: dict[str, Any]


@dataclass
class RerankResult:
    """Reranker 精排后的单条结果。

    rerank_score 为 cross-encoder logit（排序依据）；
    prob 为 sigmoid(logit) 后的相关概率（0~1，用于阈值过滤）；
    vector_score 保留粗召回阶段的向量相似度，便于对比展示。
    """

    result: SearchResult
    rerank_score: float
    prob: float
    vector_score: float
