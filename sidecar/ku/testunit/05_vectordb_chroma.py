"""
==========================================================
教学单元 05: 向量数据库 ChromaDB + 嵌入（Embedding）
==========================================================

【本单元对应 test.py 中的功能】
  - OllamaEmbeddings（文本转向量）
  - Chroma.from_documents()（存入向量数据库）
  - similarity_search_with_score()（相似度检索）

【目标】
  理解什么是文本嵌入、向量数据库，以及如何用它们实现语义搜索。

【背景知识】
  传统搜索（如 grep）是基于关键词精确匹配的：
    搜索 "session" → 只能找到包含 "session" 这个词的文档

  语义搜索是基于"含义"的：
    搜索 "如何分配会话" → 即使文档中写的是 "assign session"，也能找到

  实现语义搜索的关键技术：
    1. Embedding（嵌入）: 把文本转换为一个高维向量（如 1024 维的数字列表）
       - 含义相近的文本 → 向量距离近
       - 含义不同的文本 → 向量距离远

    2. 向量数据库: 专门用于存储和检索向量的数据库
       - 支持快速的"最近邻搜索"
       - ChromaDB 是一个轻量级的本地向量数据库

【依赖】
  pip install langchain-ollama langchain-community chromadb langchain-core
  
  还需要运行 Ollama 并拉取嵌入模型:
  ollama pull bge-m3:latest

【注意】
  本单元需要 Ollama 服务运行在 localhost:11434。
  如果没有 Ollama，可以只阅读代码和注释理解原理。
==========================================================
"""

import tempfile
import os

print("=" * 60)
print("📖 教学单元 05: 向量数据库与嵌入")
print("=" * 60)

# ==========================================
# 第一步：理解什么是嵌入（Embedding）
# ==========================================
print("\n【第一步】什么是文本嵌入？")
print("-" * 40)
print("""
  文本嵌入（Text Embedding）= 把文字转换成一组数字（向量）

  例如：
    "猫在睡觉" → [0.12, -0.34, 0.56, ..., 0.78]  (1024个数字)
    "小猫休息" → [0.11, -0.33, 0.55, ..., 0.77]  (很相近！)
    "火箭发射" → [0.89, 0.12, -0.67, ..., -0.45] (差异很大)

  向量之间的"距离"反映了语义相似度：
    - 距离小（如 0.1）→ 含义相近
    - 距离大（如 1.5）→ 含义不同

  test.py 使用的嵌入模型是 bge-m3（通过 Ollama 运行），
  它支持多语言（中文、英文等），输出 1024 维的向量。
""")

# ==========================================
# 第二步：准备文档
# ==========================================
print("\n【第二步】准备文档对象")
print("-" * 40)

from langchain_core.documents import Document

# Document 是 LangChain 的文档对象，包含两部分：
#   - page_content: 文本内容
#   - metadata: 元数据字典

documents = [
    Document(
        page_content="The Assign Session feature allows administrators to assign sessions to users.",
        metadata={"source": "assign-session.md", "title": "Assign Session > Overview", "chunk_id": 0}
    ),
    Document(
        page_content="To assign a session: 1. Go to Dashboard 2. Click Sessions 3. Click Assign button",
        metadata={"source": "assign-session.md", "title": "Assign Session > Steps", "chunk_id": 1}
    ),
    Document(
        page_content="SSH key generation: Use ssh-keygen to create a new key pair for remote access.",
        metadata={"source": "remote-setup.md", "title": "Remote > SSH Keys", "chunk_id": 0}
    ),
    Document(
        page_content="Share a session by generating a share link from the session detail page.",
        metadata={"source": "share-session.md", "title": "Share Session > Guide", "chunk_id": 0}
    ),
    Document(
        page_content="Configure the remote machine by importing the SSH profile template.",
        metadata={"source": "remote-setup.md", "title": "Remote > Configuration", "chunk_id": 1}
    ),
]

print(f"  准备了 {len(documents)} 个文档对象")
for doc in documents:
    print(f"    [{doc.metadata['source']}] {doc.page_content[:50]}...")

# ==========================================
# 第三步：创建嵌入模型 & 向量数据库
# ==========================================
print("\n\n【第三步】创建嵌入模型和向量数据库")
print("-" * 40)
print("""
  test.py 中的关键代码：

    # 1. 创建嵌入模型（连接 Ollama 服务）
    embedding_model = OllamaEmbeddings(
        model="bge-m3:latest",        # 模型名称
        base_url="http://localhost:11434"  # Ollama 服务地址
    )

    # 2. 一行代码完成：嵌入 + 存储
    db = Chroma.from_documents(
        documents=all_documents,       # 要存储的文档列表
        embedding=embedding_model,     # 嵌入模型
        persist_directory=persist_dir, # 持久化目录（数据存磁盘）
    )

  from_documents() 内部做了：
    a) 逐个调用嵌入模型，把每个 document.page_content 转为向量
    b) 把向量和元数据一起存入 ChromaDB
    c) 建立索引，支持快速检索
""")

# 尝试连接 Ollama 并执行实际操作
try:
    from langchain_ollama import OllamaEmbeddings
    from langchain_community.vectorstores import Chroma

    print("\n  正在连接 Ollama 服务...")
    embedding_model = OllamaEmbeddings(
        model="bge-m3:latest",
        base_url="http://localhost:11434"
    )

    # 使用临时目录存储（避免污染项目目录）
    persist_dir = tempfile.mkdtemp(prefix="chroma_demo_")
    print(f"  临时存储目录: {persist_dir}")

    # 创建向量数据库并写入文档
    print("  正在嵌入文档并写入 ChromaDB...")
    db = Chroma.from_documents(
        documents=documents,
        embedding=embedding_model,
        persist_directory=persist_dir,
    )
    print(f"  ✅ 写入成功! 数据库中有 {db._collection.count()} 条记录")

    # ==========================================
    # 第四步：语义搜索演示
    # ==========================================
    print("\n\n【第四步】语义搜索演示")
    print("-" * 40)
    print("""
  similarity_search_with_score(query, k=N) 的工作流程：
    1. 把查询文本转为向量
    2. 在数据库中找到距离最近的 N 个向量
    3. 返回对应的文档和距离分数

  距离越小 = 越相关（L2 欧氏距离）
    """)

    # 测试几个不同的查询
    test_queries = [
        "如何分配会话给用户",          # 中文查询！（跨语言能力）
        "how to generate SSH keys",    # 英文查询
        "share session link",          # 关键词查询
    ]

    for query in test_queries:
        print(f"\n  🔍 查询: \"{query}\"")
        results = db.similarity_search_with_score(query, k=3)
        for i, (doc, score) in enumerate(results):
            relevance = "⭐ 高相关" if score < 0.8 else "  一般" if score < 1.2 else "  低相关"
            print(f"     [{i+1}] 距离={score:.4f} {relevance}")
            print(f"         来源: {doc.metadata['title']}")
            print(f"         内容: {doc.page_content[:60]}...")

    # ==========================================
    # 第五步：理解向量距离
    # ==========================================
    print("\n\n【第五步】理解向量距离与相关性")
    print("-" * 40)
    print("""
  ChromaDB 默认使用 L2（欧氏距离）：
    - 距离 ≈ 0.3~0.6: 高度相关（几乎同义）
    - 距离 ≈ 0.6~1.0: 中度相关（相关主题）
    - 距离 ≈ 1.0~1.5: 低相关（可能只是共享少量词汇）
    - 距离 > 1.5: 不相关

  test.py 中的 RELEVANCE_DISTANCE_THRESHOLD = 1.0
  表示距离超过 1.0 的结果被认为"不相关"，会被过滤掉。

  但注意：跨语言查询（如中文问英文文档）时，
  距离普遍偏高（因为表示空间不同），所以 test.py 后来
  改用 Reranker 做精排，而不是只依赖向量距离。
    """)

    # 清理临时文件
    import shutil
    shutil.rmtree(persist_dir, ignore_errors=True)
    print(f"\n  已清理临时目录")

except ImportError as e:
    print(f"\n  ⚠️ 缺少依赖包: {e}")
    print("  请运行: pip install langchain-ollama langchain-community chromadb")
    print("\n  以下是代码逻辑的文字说明（无需实际运行）：")
    print("""
    1. OllamaEmbeddings 连接本地 Ollama 服务获取嵌入向量
    2. Chroma.from_documents() 把文档 + 向量存入本地数据库
    3. similarity_search_with_score() 用向量距离做语义检索
    4. 返回最相关的 K 个文档及其距离分数
    """)

except Exception as e:
    print(f"\n  ⚠️ 运行出错（可能 Ollama 未启动）: {e}")
    print("  请确保 Ollama 服务运行中: ollama serve")
    print("  并已拉取模型: ollama pull bge-m3:latest")

# ==========================================
# 第六步：test.py 中的数据库管理
# ==========================================
print("\n\n【第六步】test.py 中的数据库管理逻辑")
print("-" * 40)
print("""
  test.py 在写入前还做了一件事——清理旧数据：

    chroma_client = chromadb.PersistentClient(path=persist_directory)
    existing_collections = [c.name for c in chroma_client.list_collections()]
    for col_name in existing_collections:
        chroma_client.delete_collection(col_name)

  这段代码的目的是：
    - 每次运行脚本时清空旧数据，重新写入
    - 避免多次运行导致重复文档
    - 相当于"先清空再重建"的策略

  ChromaDB 概念：
    - PersistentClient: 数据存磁盘，程序关闭后不丢失
    - Collection: 类似数据库中的"表"，存放一组文档
    - 默认集合名是 "langchain"（LangChain 自动创建的）
""")

# ==========================================
# 练习
# ==========================================
print("\n" + "=" * 60)
print("🎯 动手练习")
print("=" * 60)
print("""
  1. 尝试用中文查询检索英文文档，观察距离变化
  2. 把 k 从 3 改为 5，是否会引入更多不相关结果？
  3. 添加一个与现有文档主题完全无关的文档（如"今天天气真好"），
     观察它被检索到时的距离是多少
  4. 思考：为什么 test.py 选择 bge-m3 模型？
     提示：bge-m3 是多语言模型，支持中英文混合检索
""")
