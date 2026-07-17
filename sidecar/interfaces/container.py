"""依赖容器：惰性初始化各基础设施与应用服务。

Reranker 模型较重（首次加载约 1.1GB），因此所有依赖均按需惰性构建，
避免服务启动即加载全部模型。
"""

from __future__ import annotations

from functools import cached_property

from ..application import IngestionService, QaService
from ..infrastructure import OllamaEmbedder, QdrantStore
from ..infrastructure.reranker import BgeReranker


class Container:
    """全局依赖容器（单例），按需构建各组件。"""

    @cached_property
    def embedder(self) -> OllamaEmbedder:
        return OllamaEmbedder()

    @cached_property
    def store(self) -> QdrantStore:
        return QdrantStore(self.embedder)

    @cached_property
    def reranker(self) -> BgeReranker:
        return BgeReranker()

    @cached_property
    def ingestion_service(self) -> IngestionService:
        return IngestionService(self.store)

    @cached_property
    def qa_service(self) -> QaService:
        return QaService(self.store, self.reranker)


container = Container()
