"""
==========================================================
教学单元 01: IDF（逆文档频率）基础
==========================================================

【本单元对应 test.py 中的功能】
  - compute_idf() 函数
  - STOP_WORDS 停用词表

【目标】
  理解什么是 IDF，为什么需要它，以及如何用 Python 实现。

【背景知识】
  当我们想从一堆文档中提取"关键词"时，直接数词频（TF）会有问题：
  像 "the"、"is"、"a" 这样的词在每篇文章里都频繁出现，但它们没有意义。

  IDF 的核心思想是：
    - 一个词如果在"很多"文档里都出现了 → 它太普通了，权重低
    - 一个词如果只在"少数"文档里出现 → 它有区分度，权重高

  公式: IDF(词) = log( (总文档数 + 1) / (包含该词的文档数 + 1) ) + 1
  （加 1 是平滑处理，避免除以零）

【无需外部依赖，可直接运行】
==========================================================
"""

import re
import math
from collections import Counter

# ==========================================
# 第一步：准备停用词表
# ==========================================
# 停用词（Stop Words）是指在语言中极为常见、但对理解文本主题没有帮助的词。
# 把它们过滤掉，可以让我们的关键词提取更准确。
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
}

# ==========================================
# 第二步：准备模拟文档
# ==========================================
# 在 test.py 中，文档来自磁盘上的 .md 文件。
# 这里我们用简单字符串模拟，原理完全一样。

documents = [
    "How to create a new session in the application. Click the session button to start. Then manage your session in the dashboard. And can use ssh to connect to remote machines.",
    "Remote machine configuration requires SSH keys. Generate SSH keys first.",
    "Session management allows you to assign sessions to different users.",
    "SSH connection troubleshooting: check your SSH keys and network settings.",
    "The application dashboard shows session statistics and user activity.",
]

print("=" * 60)
print("📖 教学单元 01: IDF（逆文档频率）基础")
print("=" * 60)

# ==========================================
# 第三步：统计每个词出现在多少个文档中（文档频率 DF）
# ==========================================
# 注意：我们关心的是"多少个文档包含这个词"，而不是"这个词总共出现几次"。
# 一个词在同一篇文档中出现 100 次，DF 仍然只记 1 次。

print("\n【第一步】统计文档频率 (DF)")
print("-" * 40)

doc_count = len(documents)  # 总文档数
df: Counter = Counter()  # 记录每个词出现在多少个文档中

for doc_index, doc in enumerate(documents):
    # re.findall(r"\b[a-z]{3,}\b", text) 的含义：
    #   \b       → 单词边界（确保匹配完整单词）
    #   [a-z]    → 小写字母
    #   {3,}     → 至少 3 个字符（过滤掉 "a"、"is" 等超短词）
    #   使用 set() 去重：同一文档中重复出现的词只计一次
    words_in_doc = set(re.findall(r"\b[a-z]{3,}\b", doc.lower()))

    # 过滤掉停用词
    meaningful_words = words_in_doc - STOP_WORDS

    print(f"  文档 {doc_index + 1}: 有效词 = {sorted(meaningful_words)}")

    # 每个有效词的文档频率 +1
    for word in meaningful_words:
        df[word] += 1

print(f"\n  各词的文档频率 (出现在几个文档中):")
for word, freq in df.most_common():
    print(f"    '{word}': 出现在 {freq}/{doc_count} 个文档中")

# ==========================================
# 第四步：计算 IDF 值
# ==========================================
# IDF 公式: log((总文档数 + 1) / (文档频率 + 1)) + 1
#
# 直觉理解：
#   - "session" 出现在 3/5 个文档中 → IDF = log(6/4) + 1 ≈ 1.41（较低，通用词）
#   - "troubleshooting" 只出现在 1/5 个文档中 → IDF = log(6/2) + 1 ≈ 2.10（较高，有区分度）

print("\n【第二步】计算 IDF 值")
print("-" * 40)
print(f"  公式: IDF = log((总文档数+1) / (文档频率+1)) + 1")
print(f"  总文档数 = {doc_count}")
print()

idf = {}
for word, freq in df.items():
    # 这就是 test.py 中 compute_idf() 的核心计算
    idf_value = math.log((doc_count + 1) / (freq + 1)) + 1
    idf[word] = idf_value

# 按 IDF 值排序展示
sorted_idf = sorted(idf.items(), key=lambda x: x[1], reverse=True)

print(f"  {'词':<20} {'文档频率':<10} {'IDF 值':<10} {'含义'}")
print(f"  {'─' * 60}")
for word, value in sorted_idf[:15]:
    freq = df[word]
    meaning = "⭐ 高区分度" if value > 1.8 else "普通" if value > 1.4 else "低区分度"
    print(f"  {word:<20} {freq:<10} {value:<10.4f} {meaning}")

# ==========================================
# 第五步：验证 IDF 的效果
# ==========================================
print("\n【第三步】验证 IDF 效果")
print("-" * 40)
print("  观察: IDF 值越高的词，越能代表某篇特定文档的主题")
print()
print("  例如:")
print(f"    'ssh'            IDF={idf.get('ssh', 0):.4f} → 只在 SSH 相关文档中出现")
print(f"    'session'        IDF={idf.get('session', 0):.4f} → 在多篇文档中都提到了")
print()
print("  所以在提取关键词时，'ssh' 比 'session' 更能代表特定文档的主题！")

# ==========================================
# 练习
# ==========================================
print("\n" + "=" * 60)
print("🎯 动手练习")
print("=" * 60)
print("""
  1. 试着往 documents 列表中添加更多文档，观察 IDF 值的变化
  2. 如果所有文档都包含 "session" 这个词，它的 IDF 会变成多少？
  3. 思考：为什么公式中要 +1？如果不加会怎样？

  提示：如果文档频率 = 总文档数（即所有文档都包含该词），
        IDF = log((5+1)/(5+1)) + 1 = log(1) + 1 = 0 + 1 = 1（最低值）
""")
