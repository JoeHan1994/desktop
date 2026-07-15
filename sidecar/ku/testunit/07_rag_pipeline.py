"""
==========================================================
教学单元 07: RAG 完整流水线（检索增强生成）
==========================================================

【本单元对应 test.py 中的功能】
  - ask() 函数（构建上下文 → 调用 LLM）
  - 交互式问答循环
  - SystemMessage / HumanMessage 的 prompt 构建

【目标】
  理解 RAG 的完整流程：检索 → 构建 Prompt → LLM 生成回答。

【背景知识】
  RAG = Retrieval-Augmented Generation（检索增强生成）

  普通 LLM 的问题：
    - 知识截止到训练数据的时间
    - 不知道你的私有文档（如产品手册）
    - 容易"幻觉"（编造不存在的信息）

  RAG 的解决方案：
    1. 先从向量数据库中检索相关文档片段
    2. 把这些片段作为"参考资料"放入 Prompt
    3. 让 LLM 基于这些参考资料回答，而不是靠"记忆"

  效果：LLM 的回答有据可查，减少幻觉，支持实时更新。

【依赖】
  pip install langchain-ollama langchain-core

  还需要 Ollama 运行并有对话模型:
  ollama pull gemma4:e2b  (或任何其他对话模型)
==========================================================
"""

print("=" * 60)
print("📖 教学单元 07: RAG 完整流水线")
print("=" * 60)

# ==========================================
# 第一步：理解 RAG 的整体架构
# ==========================================
print("\n【第一步】RAG 架构概览")
print("-" * 40)
print("""
  test.py 的完整 RAG 流程：

  ┌──────────────────────────────────────────────────────────┐
  │                    离线阶段（只执行一次）                   │
  ├──────────────────────────────────────────────────────────┤
  │  .md 文件 → 清洗 → 切块 → 元数据 → 嵌入 → ChromaDB      │
  │  (单元 03)  (03)   (03)   (04)    (05)     (05)         │
  └──────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │                  在线阶段（每次提问）                       │
  ├──────────────────────────────────────────────────────────┤
  │  用户提问                                                 │
  │    ↓                                                      │
  │  向量粗召回 12 个候选（单元 05）                           │
  │    ↓                                                      │
  │  Reranker 精排 → 取 Top-3（单元 06）                      │
  │    ↓                                                      │
  │  构建 Prompt（系统提示 + 文档上下文 + 用户问题）           │  ← 本单元重点
  │    ↓                                                      │
  │  LLM 生成回答                                             │  ← 本单元重点
  │    ↓                                                      │
  │  输出给用户                                               │
  └──────────────────────────────────────────────────────────┘
""")

# ==========================================
# 第二步：构建 Prompt（最关键的部分）
# ==========================================
print("\n【第二步】Prompt 构建 — RAG 的核心")
print("-" * 40)
print("""
  RAG 的 Prompt 由三部分组成：

  1. System Message（系统提示）:
     - 定义 AI 的角色和行为规则
     - 告诉它要基于"检索到的文档"回答
     - 要求它不编造、如实说不知道

  2. 文档上下文:
     - 从向量数据库检索到的 Top-N 个文档片段
     - 包含元数据（来源、章节、关联视频等）
     - 让 LLM "看到"私有知识

  3. User Message（用户消息）:
     - 文档上下文 + 用户的原始问题
""")

# 模拟检索到的文档（就是 Reranker 精排后的 Top-3）
retrieved_docs = [
    {
        "content": "The Assign Session feature allows administrators to assign existing sessions to specific users or groups. Sessions can be assigned from the admin dashboard.",
        "source": "assign-session.md",
        "title": "Assign Session > Overview",
        "related_docs": "share-session.md",
        "video_links": None,
    },
    {
        "content": "1. Navigate to the Admin Dashboard\n2. Click on 'Sessions' in the left sidebar\n3. Find the session you want to assign\n4. Click the 'Assign' button\n5. Select the user from the dropdown\n6. Click 'Confirm Assignment'",
        "source": "assign-session.md",
        "title": "Assign Session > Step-by-Step Guide",
        "related_docs": None,
        "video_links": ["/videos/assign-session-demo.mp4"],
    },
    {
        "content": "Before assigning a session, ensure that: 1. You have administrator privileges 2. The target session exists and is active 3. The assignee has a valid account",
        "source": "assign-session.md",
        "title": "Assign Session > Prerequisites",
        "related_docs": None,
        "video_links": None,
    },
]

# ==========================================
# 第三步：构建文档上下文字符串
# ==========================================
print("\n【第三步】构建文档上下文")
print("-" * 40)
print("""
  test.py 中 ask() 函数的上下文构建逻辑：
  把每个检索到的文档片段格式化为结构化文本，
  包含来源、章节、关联文档、视频链接等元数据。
""")

# 这就是 test.py 中 ask() 函数的上下文构建逻辑
context_parts = []
for i, doc in enumerate(retrieved_docs):
    # 构建头部：标注来源和章节
    header = f"[来源: {doc['source']} | 章节: {doc['title']}]"

    # 如果有关联文档，附加引用
    related = f"\n  关联文档: {doc['related_docs']}" if doc.get("related_docs") else ""

    # 如果有视频链接，附加视频信息
    video = f"\n  演示视频: {doc['video_links']}" if doc.get("video_links") else ""

    # 组装完整的片段
    context_parts.append(
        f"--- 片段 {i+1} {header}{related}{video}\n{doc['content']}"
    )

context = "\n\n".join(context_parts)

print("\n  生成的上下文字符串：")
print("  " + "·" * 50)
print(context)
print("  " + "·" * 50)

# ==========================================
# 第四步：构建完整的 Prompt
# ==========================================
print("\n\n【第四步】构建完整 Prompt")
print("-" * 40)

# 系统提示 — 定义 AI 的行为规则
system_prompt = """你是 Terraforge 产品文档助手。请根据检索到的文档片段回答用户的问题。

要求：
1. 请用中文回答。
2. 在作答之前，请先阅读检索到的文档片段，确保回答基于文档内容，而不是凭记忆或假设。
3. 在作答之前，请先思考是否有先决条件，以及当前行为的影响，如果没有不在回答中提及。
4. 如果文档中有关联的视频或者文档链接，请在回答中提及。
5. 如果文档中没有明确答案，请如实说明不知道，不要编造答案。"""

# 用户问题
question = "如何分配会话给其他用户"

# 用户消息 — 包含上下文和问题
user_prompt = f"""检索到的文档片段：
{context}

用户问题：{question}"""

print("  System Prompt（系统提示）:")
print("  " + "·" * 50)
for line in system_prompt.split("\n"):
    print(f"  {line}")
print("  " + "·" * 50)

print(f"\n  User Prompt（用户消息 - 前 200 字符）:")
print("  " + "·" * 50)
print(f"  {user_prompt[:200]}...")
print("  " + "·" * 50)

# ==========================================
# 第五步：理解 Prompt 设计的要点
# ==========================================
print("\n\n【第五步】Prompt 设计要点解析")
print("-" * 40)
print("""
  test.py 的 system_prompt 有几个精心设计的要点：

  ❶ "请根据检索到的文档片段回答"
     → 明确告诉 LLM 只用提供的材料回答，减少幻觉

  ❷ "确保回答基于文档内容，而不是凭记忆或假设"
     → 防止 LLM 用自己的训练知识"脑补"

  ❸ "先思考是否有先决条件"
     → 让 LLM 注意到 Prerequisites 片段中的前置要求

  ❹ "如果文档中有关联的视频或者文档链接，请在回答中提及"
     → 利用元数据中的 video_links 和 related_docs

  ❺ "如果文档中没有明确答案，请如实说明不知道"
     → 当检索结果不相关时，宁可不答也不编造
""")

# ==========================================
# 第六步：调用 LLM
# ==========================================
print("\n【第六步】调用 LLM 生成回答")
print("-" * 40)
print("""
  test.py 使用 LangChain 的 ChatOllama 调用本地 LLM：

    from langchain_ollama import ChatOllama
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatOllama(model="gemma4:e2b", base_url="http://localhost:11434")

    response = llm.invoke([
        SystemMessage(content=system_prompt),   # 系统角色设定
        HumanMessage(content=user_prompt),      # 用户输入（含上下文）
    ])

    answer = response.content  # 获取文本回答
""")

try:
    from langchain_ollama import ChatOllama
    from langchain_core.messages import SystemMessage, HumanMessage

    print("\n  正在连接 Ollama 并生成回答...")
    llm = ChatOllama(model="gemma4:e2b", base_url="http://localhost:11434")

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    print(f"\n  ✅ LLM 回答:")
    print(f"  {'─' * 50}")
    print(f"  {response.content}")
    print(f"  {'─' * 50}")

except ImportError as e:
    print(f"\n  ⚠️ 缺少依赖: {e}")
    print("  请运行: pip install langchain-ollama langchain-core")

except Exception as e:
    print(f"\n  ⚠️ 调用失败（可能 Ollama 未启动或模型不存在）: {e}")
    print("  请确保: ollama serve 运行中，且已 ollama pull gemma4:e2b")

# ==========================================
# 第七步：test.py 的降级策略
# ==========================================
print("\n\n【第七步】test.py 的降级策略")
print("-" * 40)
print("""
  test.py 中有一个重要的降级逻辑：

  情况 1: 向量检索无结果（candidates 为空）
    → 直接用 LLM 回答（日常对话模式，不用文档）
    → response = llm.invoke(question)

  情况 2: Reranker 判定所有候选都不相关（prob < 0.05）
    → 同样进入日常对话模式
    → 避免用不相关文档误导 LLM

  情况 3: 有相关文档
    → 正常 RAG 流程：构建上下文 → ask()

  这个设计确保了系统始终能给用户一个回答，
  而不是在没有相关文档时报错或沉默。
""")

# ==========================================
# 第八步：交互循环
# ==========================================
print("\n【第八步】交互式问答循环")
print("-" * 40)
print("""
  test.py 最后的 while True 循环：

    while True:
        question = input("请输入问题: ").strip()
        if question.lower() in ("q", "quit", "exit"):
            break

        # 1. 向量粗召回
        candidates = db.similarity_search_with_score(question, k=12)

        # 2. Reranker 精排
        ... (对 candidates 打分、排序、过滤)

        # 3. 判断是否有相关文档
        if not relevant:
            response = llm.invoke(question)  # 降级
        else:
            answer = ask(question, top_docs)  # RAG

  这就是一个完整的 RAG 应用！
  从用户输入到最终回答，所有步骤串联在一起。
""")

# ==========================================
# 练习
# ==========================================
print("=" * 60)
print("🎯 动手练习")
print("=" * 60)
print("""
  1. 修改 system_prompt，让 AI 用英文回答，观察效果变化
  2. 把 Top-N 从 3 改为 1（只给一个片段），回答质量会下降吗？
  3. 去掉 system_prompt 中的"不要编造答案"，问一个文档没有的问题，
     观察 LLM 是否会开始幻觉
  4. 思考：如果文档更新了（比如添加了新的 .md 文件），
     需要重新运行哪些步骤？
     提示：需要重新执行"离线阶段"（切块 → 嵌入 → 写入数据库）
""")
