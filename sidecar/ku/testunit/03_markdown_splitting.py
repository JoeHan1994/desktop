"""
==========================================================
教学单元 03: Markdown 文本切块（Text Splitting）
==========================================================

【本单元对应 test.py 中的功能】
  - MarkdownHeaderTextSplitter（按标题层级切分）
  - RecursiveCharacterTextSplitter（按字符数递归细分）
  - process_markdown_file() 中的文本清洗和切块逻辑

【目标】
  理解为什么要把长文档切成小块，以及两种切块策略如何配合工作。

【背景知识】
  在 RAG（检索增强生成）系统中，我们需要把文档存入向量数据库。
  但是：
    1. 嵌入模型（Embedding Model）有输入长度限制（通常 512 tokens）
    2. 太长的文本嵌入后语义会"稀释"，检索精度下降
    3. 太短的文本丢失上下文，回答质量差

  所以需要一个"切块"策略：
    - 先按 Markdown 标题（#、##）做语义分段 → 保证每块主题一致
    - 再对超长段落做递归细分 → 保证每块不超过模型限制

【依赖】
  pip install langchain-text-splitters langchain-core
==========================================================
"""

from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

print("=" * 60)
print("📖 教学单元 03: Markdown 文本切块")
print("=" * 60)

# ==========================================
# 准备示例 Markdown 文本
# ==========================================
# 这模拟了 test.py 从 docs 目录读取的 .md 文件内容
sample_markdown = """# Assign Session

## Overview

The Assign Session feature allows administrators to assign existing sessions
to specific users or groups. This is useful for managing access control
and ensuring that the right people have access to the right resources.

Sessions can be assigned from the admin dashboard by selecting the target
session and choosing the assignee from the user list.

## Prerequisites

Before assigning a session, ensure that:

1. You have administrator privileges
2. The target session exists and is active
3. The assignee has a valid account

## Step-by-Step Guide

### Method 1: From Dashboard

1. Navigate to the Admin Dashboard
2. Click on "Sessions" in the left sidebar
3. Find the session you want to assign
4. Click the "Assign" button next to the session
5. Select the user from the dropdown menu
6. Click "Confirm Assignment"

### Method 2: From Session Detail

1. Open the session detail page
2. Click "Manage Assignment" in the top-right corner
3. Search for the user by name or email
4. Select the user and confirm

## Troubleshooting

If you encounter issues with session assignment:

- Verify that the session is not already assigned to another user
- Check that the user's account status is active
- Ensure you have the required permissions
- Contact support if the issue persists
"""

print(f"\n  原始文档长度: {len(sample_markdown)} 字符")
print(f'  前 100 个字符: "{sample_markdown[:100]}..."')

# ==========================================
# 第一步：按 Markdown 标题切分
# ==========================================
print("\n\n【第一步】按 Markdown 标题层级切分")
print("-" * 40)
print("""
  MarkdownHeaderTextSplitter 的工作原理：
  - 识别 Markdown 标题标记（#、##、### 等）
  - 在每个标题处"切一刀"
  - 将标题内容作为元数据附加到对应的文本块上

  这样做的好处：
  - 每个切块都有明确的主题（由标题定义）
  - 检索时可以知道这段文字属于哪个章节
""")

# 定义要识别的标题层级
# ("#", "Header_1")  表示一级标题，元数据 key 为 "Header_1"
# ("##", "Header_2") 表示二级标题，元数据 key 为 "Header_2"
headers_to_split_on = [
    ("#", "Header_1"),
    ("##", "Header_2"),
    ("###", "Header_3"),
]

# 创建切分器并执行切分
markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
md_header_splits = markdown_splitter.split_text(sample_markdown)

print(f"  标题切分后得到 {len(md_header_splits)} 个段落:\n")
for i, doc in enumerate(md_header_splits):
    print(f"  ── 段落 {i+1} ──")
    print(f"     元数据: {doc.metadata}")
    print(f"     内容长度: {len(doc.page_content)} 字符")
    # 显示前 80 个字符作为预览
    preview = doc.page_content[:80].replace("\n", "↵")
    print(f'     预览: "{preview}..."')
    print()

# ==========================================
# 第二步：递归字符切分（处理超长段落）
# ==========================================
print("\n【第二步】递归字符切分（细分超长段落）")
print("-" * 40)
print("""
  RecursiveCharacterTextSplitter 的工作原理：
  - 设定一个最大块大小（chunk_size）和重叠量（chunk_overlap）
  - 按照优先级尝试不同的分隔符来切割：
    1. 先尝试 "\\n\\n"（段落分隔）→ 最自然的切割点
    2. 如果还是太长，尝试 "\\n"（换行符）
    3. 再不行，尝试 " "（空格）
    4. 最后才逐字符切割

  参数解释：
  - chunk_size=600    → 每块最多 600 字符
  - chunk_overlap=100 → 相邻块之间重叠 100 字符（避免上下文断裂）
""")

# 创建递归切分器
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=600,  # test.py 中使用 600
    chunk_overlap=100,  # test.py 中使用 100
    separators=["\n\n", "\n", " ", ""],  # 分隔符优先级（从最优到最差）
)

# 对标题切分的结果再做细分
# split_documents() 会保留原始的元数据
final_chunks = text_splitter.split_documents(md_header_splits)

print(f"\n  递归切分后得到 {len(final_chunks)} 个最终块:\n")
for i, chunk in enumerate(final_chunks):
    print(f"  ── Chunk {i+1} ──")
    print(f"     元数据: {chunk.metadata}")
    print(f"     字符数: {len(chunk.page_content)}")
    # 限制预览长度
    preview = chunk.page_content[:100].replace("\n", "↵")
    print(f'     预览: "{preview}..."')
    print()

# ==========================================
# 第三步：理解 chunk_overlap 的作用
# ==========================================
print("\n【第三步】理解重叠（overlap）的意义")
print("-" * 40)
print("""
  为什么需要 chunk_overlap（重叠）？

  假设一句重要的话正好被切在了边界上：
    Chunk A: "...确保你拥有管理员权限。目标会话必须"
    Chunk B: "存在且处于活跃状态。被分配者需要..."

  如果没有重叠，搜索"目标会话必须存在"可能两个块都匹配不好。
  有了重叠，两个块都会包含这句完整的话，提高检索命中率。

  但重叠不能太大：
    - 太大 → 存储浪费、嵌入重复信息
    - 太小 → 边界处信息丢失
  test.py 选择 100 字符的重叠是一个合理的折中。
""")

# 演示重叠效果
print("  演示: 查看相邻块的重叠部分")
if len(final_chunks) >= 2:
    chunk_a = final_chunks[0].page_content
    chunk_b = final_chunks[1].page_content
    # 找到重叠部分
    overlap_len = 100
    tail_a = chunk_a[-overlap_len:]
    head_b = chunk_b[:overlap_len]
    print(f'    Chunk 1 的末尾: "...{tail_a[-60:]}"')
    print(f'    Chunk 2 的开头: "{head_b[:60]}..."')
    # 找共同子串
    for length in range(min(len(tail_a), len(head_b)), 0, -1):
        if tail_a.endswith(chunk_b[:length]):
            print(f"    → 实际重叠了 {length} 个字符")
            break

# ==========================================
# 第四步：test.py 中的文本预处理
# ==========================================
print("\n\n【第四步】文本预处理（切块前的清洗）")
print("-" * 40)
print("""
  test.py 在切块之前还做了两件事：

  1. 视频标签替换:
     原始: <video><source src="demo.mp4" type="video/mp4" /></video>
     替换为: [Media Notice: There is an official demonstration video...]
     目的: 视频标签对 AI 无意义，替换为语义化描述

  2. VuePress 语法转换:
     原始: ::: tip
     替换为: 【提示】
     目的: 去除框架特有标记，保留语义
""")

import re

# 模拟 test.py 中的清洗逻辑
raw_with_video = """## Demo Section

Here's how to do it:

<video controls>
<source src="/videos/assign-session.mp4" type="video/mp4" />
</video>

::: tip
Remember to save your changes!
:::
"""

# 视频标签替换
video_pattern = r'<video.*?>\s*<source src="(.*?)" type="video/mp4" />.*?</video>'
cleaned = re.sub(
    video_pattern,
    lambda m: f"\n\n[Media Notice: There is an official demonstration video. URL: {m.group(1)}]\n\n",
    raw_with_video,
    flags=re.DOTALL,
)

# VuePress 语法替换
cleaned = (
    cleaned.replace("::: tip", "\n【提示】\n")
    .replace("::: warning", "\n【警告】\n")
    .replace("::: danger", "\n【危险】\n")
    .replace(":::", "")
)

print("  清洗前:")
print(f"    {raw_with_video.strip()}")
print("\n  清洗后:")
print(f"    {cleaned.strip()}")

# ==========================================
# 第五步：预处理对切块结果的影响
# ==========================================
print("\n\n【第五步】对比：预处理 vs 不预处理 → 切块效果差异")
print("-" * 40)
print("""
  下面用一段包含视频标签和 VuePress 语法的完整 Markdown，
  分别展示"不预处理直接切块"和"先预处理再切块"的结果差异。
""")

# 一段更完整的模拟文档（含视频、VuePress 容器、Markdown 链接）
raw_document = """# Share Session

## How to Share

You can share a session with other users by generating a share link.

<video controls>
<source src="/videos/share-session-demo.mp4" type="video/mp4" />
</video>

::: tip
Share links expire after 24 hours. Generate a new one if needed.
:::

::: warning
Only administrators can share sessions with external users.
:::

## Steps

1. Open the session detail page
2. Click the "Share" button
3. Copy the generated link
4. Send the link to the target user
"""

print("  ─── 方案 A: 不预处理，直接切块 ───")
splitter_a = MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "H1"), ("##", "H2")])
chunks_a = splitter_a.split_text(raw_document)
for i, doc in enumerate(chunks_a):
    preview = doc.page_content[:90].replace("\n", "↵")
    print(f"    Chunk {i+1} ({len(doc.page_content)}字符): {preview}...")
    # 检查是否包含 HTML 标签噪声
    if "<video" in doc.page_content or "<source" in doc.page_content:
        print(f"           ⚠️ 包含无意义的 HTML 标签!")
    if ":::" in doc.page_content:
        print(f"           ⚠️ 包含 VuePress 框架标记!")

print("\n  ─── 方案 B: 先预处理，再切块 ───")
# 执行预处理
preprocessed = re.sub(
    r'<video.*?>\s*<source src="(.*?)" type="video/mp4" />.*?</video>',
    lambda m: f"\n\n[Media Notice: There is an official demonstration video. URL: {m.group(1)}]\n\n",
    raw_document,
    flags=re.DOTALL,
)
preprocessed = (
    preprocessed.replace("::: tip", "\n【提示】\n")
    .replace("::: warning", "\n【警告】\n")
    .replace("::: danger", "\n【危险】\n")
    .replace(":::", "")
)

splitter_b = MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "H1"), ("##", "H2")])
chunks_b = splitter_b.split_text(preprocessed)
for i, doc in enumerate(chunks_b):
    preview = doc.page_content[:90].replace("\n", "↵")
    print(f"    Chunk {i+1} ({len(doc.page_content)}字符): {preview}...")
    if "[Media Notice" in doc.page_content:
        print(f"           ✅ 视频链接已转为语义描述，AI 可理解")
    if "【提示】" in doc.page_content or "【警告】" in doc.page_content:
        print(f"           ✅ VuePress 标记已转为可读文本")

print("""
  对比结论：
    方案 A → Chunk 中混入了 <video>、::: 等无意义标记
             嵌入时这些标记会干扰语义理解，降低检索精度

    方案 B → 所有内容都是 AI 可理解的自然语言
             视频链接保留了 URL 信息（可在回答中推荐）
             VuePress 容器语义保留（"提示"/"警告"）

  这就是 test.py 为什么要在切块之前做预处理！
""")

# ==========================================
# 练习
# ==========================================
print("=" * 60)
print("🎯 动手练习")
print("=" * 60)
print("""
  1. 修改 chunk_size 为 200，观察切块数量如何变化
  2. 把 chunk_overlap 设为 0，比较切块边界的内容
  3. 在 raw_document 中添加一个 ::: danger 容器，观察预处理效果
  4. 尝试添加一种新的预处理规则：把 <img src="..." /> 替换为 [图片: ...]
  5. 思考：chunk_size 设多大最合适？
     提示：取决于嵌入模型的 token 限制和检索精度需求
""")
