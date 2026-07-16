# Terraforge RAG 系统 — 教学单元

本目录包含 7 个独立可运行的 Python 教学文件，逐步拆解 `test.py` 中的 RAG（检索增强生成）系统。

## 学习路线图

```
test.py 的完整流程：

  .md 文件 → 清洗/切块 → 元数据 → 嵌入向量化 → ChromaDB
                                                    ↓
  用户提问 → 向量粗召回 → Reranker 精排 → 构建 Prompt → LLM 回答
```

| 序号 | 文件                        | 主题                 | 对应 test.py 功能                                               | 依赖                                        |
| ---- | --------------------------- | -------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| 01   | `01_idf_basics.py`          | IDF 逆文档频率       | `compute_idf()`                                                 | 无（纯 Python）                             |
| 02   | `02_tfidf_tags.py`          | TF-IDF 关键词提取    | `extract_tags()`                                                | 无（纯 Python）                             |
| 03   | `03_markdown_splitting.py`  | Markdown 文本切块    | `MarkdownHeaderTextSplitter` + `RecursiveCharacterTextSplitter` | langchain-text-splitters                    |
| 04   | `04_metadata_enrichment.py` | 文档元数据丰富化     | `process_markdown_file()` 中的元数据逻辑                        | 无（纯 Python）                             |
| 05   | `05_vectordb_chroma.py`     | 向量数据库与语义搜索 | `OllamaEmbeddings` + `Chroma`                                   | langchain-ollama, chromadb, **Ollama 服务** |
| 06   | `06_reranker.py`            | Reranker 重排序      | `bge-reranker-v2-m3` 两阶段精排                                 | torch, transformers                         |
| 07   | `07_rag_pipeline.py`        | RAG 完整流水线       | `ask()` 函数 + Prompt 构建                                      | langchain-ollama, **Ollama 服务**           |

## 建议学习顺序

1. **先学 01 和 02**（无任何依赖，理解基础算法）
2. **再学 03 和 04**（理解文档处理流程）
3. **然后学 05**（需要 Ollama，理解向量化）
4. **接着学 06**（需要 PyTorch，理解精排）
5. **最后学 07**（理解如何把一切串联起来）

## 环境准备

```bash
# 基础依赖（01-04 单元）
pip install langchain-text-splitters langchain-core

# 向量化相关（05 单元）
pip install langchain-ollama langchain-community chromadb

# Reranker 相关（06 单元）
pip install torch transformers

# Ollama 服务（05、07 单元需要）
# 下载 Ollama: https://ollama.ai
ollama pull bge-m3:latest    # 嵌入模型
ollama pull gemma4:e2b       # 对话模型（可替换为任意模型）
```

## 运行方式

每个文件都是独立的，可以直接运行：

```bash
cd sidecar/ku/testunit
python 01_idf_basics.py
python 02_tfidf_tags.py
# ...以此类推
```

## test.py 整体架构总结

```
┌─────────────────── 离线阶段（建库）───────────────────┐
│                                                        │
│  1. 扫描 docs/ 目录下所有 .md 文件                     │
│  2. 计算全局 IDF（用于后续标签提取）                    │
│  3. 对每个文件:                                        │
│     a. 清洗（视频标签→语义文本, VuePress语法→普通文本） │
│     b. 按标题切块 → 按字符数细分                       │
│     c. 为每块附加丰富元数据                            │
│     d. TF-IDF 提取关键词标签                           │
│  4. 所有块写入 ChromaDB（bge-m3 嵌入）                 │
│                                                        │
└────────────────────────────────────────────────────────┘

┌─────────────────── 在线阶段（问答）───────────────────┐
│                                                        │
│  1. 用户输入问题                                       │
│  2. 向量粗召回 12 个候选                               │
│  3. Reranker (bge-reranker-v2-m3) 精排                │
│     - 概率 > 0.05 的保留                              │
│     - 取 Top-3                                         │
│  4. 构建 Prompt（系统提示 + 文档上下文 + 用户问题）    │
│  5. 调用 LLM (gemma4:e2b) 生成回答                    │
│  6. 降级策略：无相关文档时直接对话                     │
│                                                        │
└────────────────────────────────────────────────────────┘
```
