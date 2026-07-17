"""
==========================================================
教学单元 02: TF-IDF 关键词提取
==========================================================

【本单元对应 test.py 中的功能】
  - extract_tags() 函数

【目标】
  理解 TF-IDF 如何组合使用 TF 和 IDF 来提取关键词（标签）。

【背景知识】
  TF（词频）: 一个词在当前文档中出现的次数
  IDF（逆文档频率）: 一个词在整个文档集合中的稀有程度（上一单元已学）

  TF-IDF = TF × IDF
  含义：一个词在当前文档中出现次数多（TF 高），
        同时在其他文档中很少出现（IDF 高），
        那它就是这篇文档的"标签级关键词"。

【无需外部依赖，可直接运行】
==========================================================
"""

import re
import math
from collections import Counter

# 复用上一单元的停用词表（简化版）
STOP_WORDS = {
    "the",
    "be",
    "to",
    "of",
    "and",
    "a",
    "in",
    "that",
    "have",
    "i",
    "it",
    "for",
    "not",
    "on",
    "with",
    "as",
    "you",
    "do",
    "at",
    "this",
    "but",
    "by",
    "from",
    "they",
    "we",
    "or",
    "an",
    "will",
    "all",
    "would",
    "there",
    "their",
    "what",
    "so",
    "up",
    "if",
    "about",
    "who",
    "get",
    "which",
    "go",
    "me",
    "when",
    "can",
    "like",
    "no",
    "just",
    "know",
    "into",
    "your",
    "some",
    "them",
    "see",
    "other",
    "than",
    "then",
    "now",
    "only",
    "its",
    "also",
    "how",
    "our",
    "is",
    "are",
    "was",
    "were",
    "been",
    "has",
    "had",
    "does",
    "did",
    "click",
    "open",
    "enter",
    "step",
    "find",
    "type",
    "name",
}

# ==========================================
# 准备模拟文档集合（用于计算 IDF）
# ==========================================
documents = [
    """How to create a new session in the application. 
    Click the session button to start a new session. 
    Session management is available in the dashboard.""",
    """Remote machine configuration requires SSH keys. 
    Generate SSH keys using ssh-keygen command. 
    SSH connection uses port 22 by default. 
    Configure SSH server settings for remote access.""",
    """Session assignment allows administrators to assign 
    sessions to different users. Share session links 
    with team members for collaboration.""",
    """Troubleshooting SSH connection issues. 
    Check SSH keys and verify network connectivity. 
    Common SSH errors include permission denied and timeout.""",
    """The application pipeline processes documents 
    through multiple stages: ingestion, embedding, 
    and vector storage for semantic search.""",
]

print("=" * 60)
print("📖 教学单元 02: TF-IDF 关键词提取")
print("=" * 60)

# ==========================================
# 第一步：计算整个文档集的 IDF（与上一单元相同）
# ==========================================
print("\n【第一步】计算文档集的 IDF")
print("-" * 40)

doc_count = len(documents)
df: Counter = Counter()

for doc in documents:
    words = set(re.findall(r"\b[a-z]{3,}\b", doc.lower()))
    for w in words:
        if w not in STOP_WORDS:
            df[w] += 1

idf = {w: math.log((doc_count + 1) / (freq + 1)) + 1 for w, freq in df.items()}
print(f"  文档集共 {doc_count} 篇，词汇表大小: {len(idf)} 个有效词")

# ==========================================
# 第二步：对单篇文档计算 TF（词频）
# ==========================================
print("\n【第二步】计算单篇文档的 TF（词频）")
print("-" * 40)

# 选第二篇文档（SSH 相关）来演示
target_doc = documents[1]
print(f'  目标文档: "{target_doc[:60]}..."')
print()

# 提取所有有效词并统计词频
words = re.findall(r"\b[a-z]{3,}\b", target_doc.lower())
# Counter 会统计列表中每个元素出现的次数
tf = Counter(w for w in words if w not in STOP_WORDS)

print(f"  词频统计 (TF):")
for word, count in tf.most_common(10):
    print(f"    '{word}': 出现 {count} 次")

# ==========================================
# 第三步：计算 TF-IDF 得分
# ==========================================
print("\n【第三步】计算 TF-IDF 得分")
print("-" * 40)
print("  公式: TF-IDF(词) = TF(词) × IDF(词)")
print("  TF = 该词在本文档中出现的次数")
print("  IDF = 该词在整个文档集中的稀有程度")
print()

# TF-IDF 计算：词频 × 逆文档频率
# idf.get(w, 1.0) 的意思是：如果某词不在 IDF 字典中，给它一个中性权重 1.0
scores = {w: count * idf.get(w, 1.0) for w, count in tf.items()}

# 按得分降序排列
ranked = sorted(scores.items(), key=lambda x: (x[1], x[0]), reverse=True)

print(f"  {'词':<20} {'TF':<6} {'IDF':<8} {'TF×IDF':<10} {'解读'}")
print(f"  {'─' * 65}")
for word, score in ranked:
    tf_val = tf[word]
    idf_val = idf.get(word, 1.0)
    interpretation = (
        "⭐ 强关键词" if score > 3.0 else "一般词" if score > 1.5 else "弱信号"
    )
    print(f"  {word:<20} {tf_val:<6} {idf_val:<8.3f} {score:<10.3f} {interpretation}")

# ==========================================
# 第四步：提取 Top-N 标签
# ==========================================
print("\n【第四步】提取 Top-N 标签")
print("-" * 40)


def extract_tags(text: str, idf: dict, top_n: int = 6) -> list[str]:
    """
    这就是 test.py 中的 extract_tags() 函数。

    参数:
      text   - 要提取标签的文本
      idf    - 预先计算好的 IDF 字典
      top_n  - 返回前 N 个标签

    返回:
      按 TF-IDF 得分降序排列的关键词列表
    """
    # 1. 分词：提取所有 3 个字母以上的小写单词
    words = re.findall(r"\b[a-z]{3,}\b", text.lower())

    # 2. 统计词频，同时过滤停用词
    tf = Counter(w for w in words if w not in STOP_WORDS)

    # 3. 如果没有有效词，返回空列表
    if not tf:
        return []

    # 4. 计算 TF-IDF 得分
    scores = {w: count * idf.get(w, 1.0) for w, count in tf.items()}

    # 5. 按得分降序排列（得分相同时按字母序，保证结果稳定）
    ranked = sorted(scores.items(), key=lambda x: (x[1], x[0]), reverse=True)

    # 6. 取前 N 个词作为标签
    return [w for w, _ in ranked[:top_n]]


# 对每篇文档提取标签
print("\n  各文档的自动标签:")
for i, doc in enumerate(documents):
    tags = extract_tags(doc, idf, top_n=4)
    preview = doc.strip().split("\n")[0][:50]
    print(f'\n  文档 {i+1}: "{preview}..."')
    print(f"         标签: {tags}")

# ==========================================
# 第五步：对比验证
# ==========================================
print("\n\n【第五步】对比验证 - 为什么不能只用 TF？")
print("-" * 40)
print("""
  假设只用 TF（词频）来提取关键词：
    - "session" 在文档1中出现3次 → 会被选为关键词
    - 但 "session" 在文档3中也频繁出现
    - 它其实是一个"通用词"，不能很好地区分文档

  使用 TF-IDF：
    - "session" 的 IDF 较低（因为出现在多个文档中）
    - 所以 TF × IDF 不会太高
    - 而 "ssh" 只在 SSH 相关文档中出现，IDF 高
    - 最终 "ssh" 的 TF-IDF 得分更高，成为更好的标签

  这就是为什么 test.py 要先用 compute_idf() 计算全局 IDF，
  再用 extract_tags() 为每个文本块提取区分度高的关键词。
""")

# ==========================================
# 练习
# ==========================================
print("=" * 60)
print("🎯 动手练习")
print("=" * 60)
print("""
  1. 修改 top_n 参数，观察标签数量变化
  2. 往 documents 中添加更多包含 "ssh" 的文档，观察 "ssh" 的 IDF 如何下降
  3. 思考：为什么 test.py 中 extract_tags 用 top_n=6？太多或太少有什么问题？
     提示：太多 → 标签噪声大；太少 → 可能遗漏重要主题词
""")
