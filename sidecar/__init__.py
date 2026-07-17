"""Terraforge Python sidecar：DDD 分层的本地 AI 服务。

分层结构：
- domain/         纯数据模型（框架无关）
- infrastructure/ 外部依赖封装（Ollama / Qdrant / Reranker / 解析器）
- application/    业务流程编排（摄取 / 问答）
- interfaces/     对外 HTTP API（FastAPI）
"""
