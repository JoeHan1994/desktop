"""领域模型：文档与文本块。

纯数据结构，不依赖任何外部框架（LangChain / Qdrant / FastAPI）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Chunk:
    """文档切分后的最小语义单元，携带丰富元数据供检索与展示使用。"""

    text: str
    source: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Document:
    """单个源文件解析后的结果：原始内容 + 切分出的文本块集合。"""

    source: str
    raw: str
    chunks: list[Chunk] = field(default_factory=list)
