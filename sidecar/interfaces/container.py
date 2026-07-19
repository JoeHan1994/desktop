"""依赖容器：惰性初始化各基础设施与应用服务。

所有依赖均按需惰性构建，避免服务启动即加载全部模型。
"""

from __future__ import annotations

from functools import cached_property

from ..application import IngestionService, QaService
from ..infrastructure import LlmService, OllamaEmbedder, VectorStore


class Container:
    """全局依赖容器（单例），按需构建各组件。"""

    @cached_property
    def embedder(self) -> OllamaEmbedder:
        return OllamaEmbedder()

    @cached_property
    def store(self) -> VectorStore:
        return VectorStore(self.embedder)

    @property
    def vector_store(self) -> VectorStore:
        """外部可访问的向量库（与 store 同一实例）。"""
        return self.store

    @cached_property
    def llm_service(self) -> LlmService:
        return LlmService()

    @cached_property
    def ingestion_service(self) -> IngestionService:
        return IngestionService(self.store)

    @cached_property
    def qa_service(self) -> QaService:
        return QaService(self.store, self.llm_service)


container = Container()
