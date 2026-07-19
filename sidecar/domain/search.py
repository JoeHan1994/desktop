"""领域模型：检索与重排序结果。

纯数据结构，供向量检索、LLM 过滤提取以及问答上下文构建共享。
"""

from __future__ import annotations

from dataclasses import dataclass, field
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
    """Reranker 精排后的单条结果（保留供外部工具使用）。"""

    result: SearchResult
    rerank_score: float
    prob: float
    vector_score: float


@dataclass
class FilterParams:
    """LLM 从用户问题中提取的元数据过滤参数。

    None 表示该维度不过滤；True/False 表示要求或排除该内容类型；
    tags 为 0~3 个关键词，辅助向量检索语义匹配（不参与硬过滤）。
    """

    has_video: bool | None = None
    has_code: bool | None = None
    has_steps: bool | None = None
    contains_table: bool | None = None
    tags: list[str] = field(default_factory=list)
