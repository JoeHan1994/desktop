"""领域层：核心数据模型（框架无关）。"""

from .document import Chunk, Document
from .search import FilterParams, RerankResult, SearchResult

__all__ = ["Chunk", "Document", "SearchResult", "RerankResult", "FilterParams"]
