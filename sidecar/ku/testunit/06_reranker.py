"""
==========================================================
教学单元 06: Reranker 重排序
==========================================================

【本单元对应 test.py 中的功能】
  - bge-reranker-v2-m3 模型加载
  - 向量粗召回 → Reranker 精排的两阶段检索
  - sigmoid 概率阈值过滤

【目标】
  理解为什么向量检索不够精准，Reranker 如何弥补不足。

【背景知识】
  向量检索的问题：
    1. 嵌入模型把文本压缩成一个固定长度的向量
    2. 这个压缩过程会丢失信息（有损压缩）
    3. 跨语言时（如中文问题 vs 英文文档），向量距离区分度更低
    4. 短文本（如 "分配会话"）的嵌入信息量不足

  Reranker 的工作方式完全不同：
    - 不是把文本压缩成向量再比距离
    - 而是把"查询"和"文档"拼在一起，让模型直接判断"相关 or 不相关"
    - 类似于一个"是/否"分类器
    - 精度远高于向量距离，但速度慢得多

  所以 test.py 使用"两阶段"策略：
    Stage 1: 向量检索（快）→ 粗召回 12 个候选
    Stage 2: Reranker（慢但准）→ 对 12 个候选精排，取前 3 个

  这就是工业界常用的"召回 + 精排"架构。

【依赖】
  pip install torch transformers

  首次运行会自动下载 bge-reranker-v2-m3 模型（约 1.1GB）
==========================================================
"""

print("=" * 60)
print("📖 教学单元 06: Reranker 重排序")
print("=" * 60)

# ==========================================
# 第一步：理解两阶段检索架构
# ==========================================
print("\n【第一步】为什么需要两阶段检索？")
print("-" * 40)
print("""
  假设你的文档库有 10000 个 chunk：

  方案 A: 只用向量检索
    速度: 快（毫秒级）
    精度: 中等（会有假阳性）
    缺点: 跨语言、短查询时效果差

  方案 B: 只用 Reranker
    速度: 极慢（每对 query-doc 都要过模型）
    精度: 很高
    缺点: 10000 个文档逐一比较太慢了

  方案 C: 向量粗召回 + Reranker 精排（test.py 的方案）
    1. 向量检索快速找到 12 个候选（从 10000 → 12）
    2. Reranker 对这 12 个精细判断（12 次推理很快）
    3. 取最相关的 3 个给 LLM
    兼顾速度和精度！

  test.py 中的参数：
    RETRIEVE_K = 12          # 粗召回数量
    RERANK_TOP_N = 3         # 最终使用的数量
    RERANK_PROB_THRESHOLD = 0.05  # 最低相关概率
""")

# ==========================================
# 第二步：加载 Reranker 模型
# ==========================================
print("\n【第二步】加载 Reranker 模型")
print("-" * 40)
print("""
  test.py 使用的模型: BAAI/bge-reranker-v2-m3
  
  这是一个交叉编码器（Cross-Encoder）：
  - 输入: [query, document] 文本对
  - 输出: 一个分数（logit），表示相关程度
  - sigmoid(logit) 转换为概率（0~1）
  
  与嵌入模型的区别：
  - 嵌入模型: 文本 → 向量（独立编码，可以预计算）
  - 交叉编码器: [文本A, 文本B] → 分数（必须一对一比较）
""")

try:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    print("\n  正在加载 Reranker 模型 (bge-reranker-v2-m3)...")
    print("  （首次运行需要下载约 1.1GB，请耐心等待）")

    tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-reranker-v2-m3")
    model = AutoModelForSequenceClassification.from_pretrained(
        "BAAI/bge-reranker-v2-m3"
    )
    model.eval()  # 设为评估模式（关闭 dropout 等训练时行为）
    print("  ✅ 模型加载完成!")

    # ==========================================
    # 第三步：Reranker 打分演示
    # ==========================================
    print("\n\n【第三步】Reranker 打分演示")
    print("-" * 40)
    print("""
  我们给 Reranker 一个查询和多个候选文档，
  让它判断每个文档与查询的相关程度。
    """)

    # 模拟一个用户查询和向量检索返回的候选文档
    query = "如何分配会话给其他用户"

    candidates = [
        "The Assign Session feature allows administrators to assign sessions to users. Select the target session and choose an assignee.",
        "SSH key generation: Use ssh-keygen to create a new key pair for remote machine access.",
        "Share a session by generating a share link from the session detail page. Users can click the link to join.",
        "Session assignment allows administrators to assign sessions to different users for collaboration.",
        "Configure the remote machine by importing the SSH profile template JSON file.",
    ]

    print(f'  查询: "{query}"')
    print(f"  候选文档数: {len(candidates)}")
    print()

    # 构建输入对：[查询, 文档] 的列表
    # test.py 中还会把章节标题拼在文档前面，增强主题信号
    pairs = [[query, doc] for doc in candidates]

    # Tokenize: 把文本转换为模型能理解的数字序列
    # padding=True: 把短文本填充到相同长度
    # truncation=True: 超长文本截断
    # max_length=512: 最大 token 数
    with torch.no_grad():  # 推理时不需要计算梯度，节省内存
        inputs = tokenizer(
            pairs,
            padding=True,
            truncation=True,
            return_tensors="pt",  # 返回 PyTorch 张量
            max_length=512,
        )

        # 模型前向传播，得到 logits（原始分数）
        logits = model(**inputs, return_dict=True).logits.view(-1).float()

        # logits 转换为概率（通过 sigmoid 函数）
        # sigmoid: 把任意实数映射到 (0, 1) 区间
        probs = torch.sigmoid(logits).tolist()
        scores = logits.tolist()

    # ==========================================
    # 第四步：理解分数和阈值
    # ==========================================
    print("\n【第四步】Reranker 分数解读")
    print("-" * 40)
    print("""
  Reranker 输出两个值：
    - logit（原始分数）: 范围是 (-∞, +∞)，越大越相关
    - prob（概率）: sigmoid(logit)，范围 (0, 1)，越大越相关

  test.py 用概率做阈值（RERANK_PROB_THRESHOLD = 0.05）：
    - prob > 0.05: 保留（可能相关）
    - prob ≤ 0.05: 丢弃（明显不相关）

  为什么用概率而不是 logit？
    - 概率有绝对意义（0~1），跨查询可比较
    - logit 的范围不固定，不同查询之间难以比较
    """)

    print(f"\n  {'排名':<4} {'Logit':<10} {'概率':<10} {'判定':<12} {'文档预览'}")
    print(f"  {'─' * 75}")

    # 按分数降序排列
    ranked = sorted(
        zip(candidates, scores, probs),
        key=lambda x: x[1],
        reverse=True,
    )

    RERANK_PROB_THRESHOLD = 0.05
    RERANK_TOP_N = 3

    for i, (doc, score, prob) in enumerate(ranked):
        passed = prob > RERANK_PROB_THRESHOLD
        used = passed and i < RERANK_TOP_N
        if used:
            status = "✅ 采用"
        elif passed:
            status = "⚠️ 通过但超额"
        else:
            status = "❌ 过滤"
        preview = doc[:45]
        print(f"  {i+1:<4} {score:<10.4f} {prob:<10.4f} {status:<12} {preview}...")

    # ==========================================
    # 第五步：为什么把标题拼到正文中
    # ==========================================
    print("\n\n【第五步】增强 Reranker 精度的技巧")
    print("-" * 40)
    print("""
  test.py 中有这样一段代码：

    pairs = [
        [question, f"{doc.metadata.get('title', '')}\\n\\n{doc.page_content}"]
        for doc in cand_docs
    ]

  它把 chunk 的标题拼到正文前面再送给 Reranker。

  为什么？
  - 文档正文可能不包含明确的主题词
    例如正文是 "1. Go to Dashboard 2. Click Sessions..."
    不包含 "assign session" 这个关键主题
  - 但标题是 "Assign Session > Steps"
  - 拼上标题后，Reranker 能更准确地判断这段确实在讲"分配会话"

  这是一个实用的工程技巧：补充上下文信息以提高精排精度。
    """)

    # 演示效果对比
    print("  对比实验：有标题 vs 无标题")
    title = "Assign Session > Step-by-Step Guide"
    content = "1. Navigate to Dashboard 2. Click Sessions 3. Click Assign button 4. Select user"

    pairs_no_title = [[query, content]]
    pairs_with_title = [[query, f"{title}\n\n{content}"]]

    with torch.no_grad():
        # 无标题
        inputs1 = tokenizer(
            pairs_no_title,
            padding=True,
            truncation=True,
            return_tensors="pt",
            max_length=512,
        )
        prob_no_title = torch.sigmoid(
            model(**inputs1, return_dict=True).logits.view(-1).float()
        ).item()

        # 有标题
        inputs2 = tokenizer(
            pairs_with_title,
            padding=True,
            truncation=True,
            return_tensors="pt",
            max_length=512,
        )
        prob_with_title = torch.sigmoid(
            model(**inputs2, return_dict=True).logits.view(-1).float()
        ).item()

    print(f"    无标题: prob = {prob_no_title:.4f}")
    print(f"    有标题: prob = {prob_with_title:.4f}")
    print(
        f"    提升: {((prob_with_title - prob_no_title) / max(prob_no_title, 0.001)) * 100:.1f}%"
    )

except ImportError as e:
    print(f"\n  ⚠️ 缺少依赖: {e}")
    print("  请运行: pip install torch transformers")
    print("\n  以下是 Reranker 的工作原理总结：")
    print("""
    1. 输入: [查询文本, 候选文档] 对
    2. 模型内部: 用 Transformer 联合编码两段文本
    3. 输出: logit 分数 → sigmoid 转概率
    4. 按概率降序排列，过滤低于阈值的，取 Top-N
    """)

# ==========================================
# 第六步：完整的两阶段检索流程
# ==========================================
print("\n\n【第六步】test.py 的完整两阶段检索流程")
print("-" * 40)
print("""
  ┌─────────────────────────────────────────────────────────┐
  │ 用户输入: "如何分配会话给其他用户"                         │
  └────────────────────────┬────────────────────────────────┘
                           ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Stage 1: 向量粗召回 (RETRIEVE_K=12)                      │
  │   - 把查询转为向量                                       │
  │   - 在 ChromaDB 中找 12 个最近的向量                     │
  │   - 不做距离过滤（跨语言时距离不可靠）                    │
  └────────────────────────┬────────────────────────────────┘
                           ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Stage 2: Reranker 精排                                   │
  │   - 对 12 个候选逐一打分                                 │
  │   - 标题 + 正文拼接后送入模型                            │
  │   - sigmoid(logit) → 概率                                │
  │   - 过滤 prob < 0.05 的（明显不相关）                    │
  │   - 取 Top-3 作为最终上下文                              │
  └────────────────────────┬────────────────────────────────┘
                           ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Stage 3: 交给 LLM 生成回答（下一单元）                    │
  └─────────────────────────────────────────────────────────┘
""")

# ==========================================
# 练习
# ==========================================
print("=" * 60)
print("🎯 动手练习")
print("=" * 60)
print("""
  1. 修改 RERANK_PROB_THRESHOLD 为 0.5，观察有多少候选被过滤掉
  2. 用英文查询 "how to assign session" 替代中文查询，比较分数变化
  3. 思考：为什么 RETRIEVE_K=12 而不是 100？
     提示：Reranker 推理有成本，12 个是速度和召回率的平衡
  4. 如果 Reranker 判定所有候选都不相关（prob < 0.05），
     test.py 会怎么做？→ 进入日常对话模式（不用文档回答）
""")
