"""
==========================================================
教学单元 04: 文档元数据（Metadata）丰富化
==========================================================

【本单元对应 test.py 中的功能】
  - process_markdown_file() 中为每个 chunk 附加元数据的逻辑
  - resolve_doc_link() 函数（解析文档内链接）

【目标】
  理解为什么要给每个文本块添加元数据，以及每种元数据的用途。

【背景知识】
  向量数据库存储的不仅是文本本身，还有"元数据"。
  元数据就像书签和标签，帮助我们：
    1. 知道这段文字来自哪个文件的哪个章节
    2. 知道这段文字是步骤、表格还是纯文本
    3. 知道它与哪些其他文档相关
    4. 在检索后为 LLM 提供额外上下文

  test.py 为每个 chunk 附加了丰富的元数据：
    - source: 来源文件路径
    - chunk_id / total_chunks: 在文件中的位置编号
    - title: 所属章节标题
    - chunk_position: start / middle / end
    - content_type: text / steps / list / table
    - has_video / video_links: 是否有演示视频
    - related_docs: 跨文件内链引用
    - tags: TF-IDF 关键词标签

【无需外部依赖，可直接运行】
==========================================================
"""

import re
from pathlib import Path

print("=" * 60)
print("📖 教学单元 04: 文档元数据丰富化")
print("=" * 60)

# ==========================================
# 模拟切块后的文本（假设已经完成了第 03 单元的切块）
# ==========================================
# 这些模拟 test.py 中 text_splitter.split_documents() 的输出
chunks = [
    {
        "content": """The Assign Session feature allows administrators to assign existing sessions
to specific users or groups. This is useful for managing access control
and ensuring that the right people have access to the right resources.

Sessions can be assigned from the admin dashboard by selecting the target
session and choosing the assignee from the user list.""",
        "Header_1": "Assign Session",
        "Header_2": "Overview",
    },
    {
        "content": """Before assigning a session, ensure that:

1. You have administrator privileges
2. The target session exists and is active
3. The assignee has a valid account""",
        "Header_1": "Assign Session",
        "Header_2": "Prerequisites",
    },
    {
        "content": """1. Navigate to the Admin Dashboard
2. Click on "Sessions" in the left sidebar
3. Find the session you want to assign
4. Click the "Assign" button next to the session
5. Select the user from the dropdown menu
6. Click "Confirm Assignment"

[Media Notice: There is an official demonstration video. URL: /videos/assign-session-demo.mp4]""",
        "Header_1": "Assign Session",
        "Header_2": "Step-by-Step Guide",
    },
    {
        "content": """If you encounter issues with session assignment:

- Verify that the session is not already assigned to another user
- Check that the user's account status is active
- Ensure you have the required [permissions](../guide/permissions.md)
- See also: [Share Session](share-session.md) for related functionality
- Contact support if the issue persists

| Error Code | Meaning | Solution |
| --- | --- | --- |
| E001 | Session locked | Wait or force-unlock |
| E002 | User not found | Verify user email |""",
        "Header_1": "Assign Session",
        "Header_2": "Troubleshooting",
    },
]

# ==========================================
# 第一步：基础位置元数据
# ==========================================
print("\n【第一步】基础位置元数据")
print("-" * 40)
print("""
  每个 chunk 需要知道"自己在哪"：
  - source: 来自哪个文件（如 "assign-session.md"）
  - chunk_id: 在该文件中是第几个块（从 0 开始）
  - total_chunks: 该文件一共有几个块
  - chunk_position: start（开头）/ middle（中间）/ end（结尾）
  - title: 所属章节标题（由 Markdown 标题拼接）
""")

source_file = "assign-session.md"
total = len(chunks)

for i, chunk in enumerate(chunks):
    meta = {}
    # source: 文件的相对路径
    meta["source"] = source_file
    # chunk_id: 块的序号
    meta["chunk_id"] = i
    # total_chunks: 该文件的总块数
    meta["total_chunks"] = total

    # title: 从 Header 层级拼出可读标题
    # test.py 中把 Header_1、Header_2 用 " > " 连接
    title_parts = [chunk.get("Header_1", ""), chunk.get("Header_2", "")]
    title_parts = [p for p in title_parts if p]  # 过滤空字符串
    meta["title"] = " > ".join(title_parts) if title_parts else source_file

    # chunk_position: 标记位置
    if i == 0:
        meta["chunk_position"] = "start"
    elif i == total - 1:
        meta["chunk_position"] = "end"
    else:
        meta["chunk_position"] = "middle"

    meta["char_count"] = len(chunk["content"])

    print(
        f"  Chunk {i}: title=\"{meta['title']}\" | pos={meta['chunk_position']} | chars={meta['char_count']}"
    )

# ==========================================
# 第二步：内容类型推断
# ==========================================
print("\n\n【第二步】内容类型推断")
print("-" * 40)
print("""
  test.py 通过正则表达式判断文本块的内容类型：
  - "steps"  : 包含有序列表（1. 2. 3.）→ 教程/操作步骤
  - "list"   : 包含无序列表（- 或 *）→ 要点列表
  - "table"  : 包含 | 和 --- → 表格数据
  - "text"   : 以上都不是 → 纯文本/段落

  为什么要做这个分类？
  → 在 LLM 回答时可以告诉它"这段内容是步骤类型的"，
    让它用适合的格式来呈现答案。
""")

for i, chunk in enumerate(chunks):
    text = chunk["content"]

    # 检测有序列表：行首数字 + 点 + 空格（如 "1. "）
    has_ordered_list = bool(re.search(r"^\d+\.\s", text, re.MULTILINE))

    # 检测无序列表：行首 - 或 * + 空格
    has_unordered_list = bool(re.search(r"^[-*]\s", text, re.MULTILINE))

    # 检测代码：包含反引号
    has_code = "`" in text

    # 检测表格：同时包含 | 和 ---
    contains_table = "|" in text and "---" in text

    # 按优先级确定类型（表格 > 步骤 > 列表 > 纯文本）
    if contains_table:
        content_type = "table"
    elif has_ordered_list:
        content_type = "steps"
    elif has_unordered_list:
        content_type = "list"
    else:
        content_type = "text"

    print(
        f"  Chunk {i}: type={content_type:6s} | ordered={has_ordered_list} | unordered={has_unordered_list} | table={contains_table} | code={has_code}"
    )

# ==========================================
# 第三步：视频链接检测
# ==========================================
print("\n\n【第三步】视频链接检测")
print("-" * 40)
print("""
  test.py 在预处理阶段把 <video> 标签替换为了语义化文本：
    [Media Notice: There is an official demonstration video. URL: ...]

  然后在元数据中记录哪些 chunk 包含视频引用。
  这样 LLM 在回答时可以提醒用户"还有演示视频可以参考"。
""")

# 模拟已提取的视频链接列表
found_videos = ["/videos/assign-session-demo.mp4"]

for i, chunk in enumerate(chunks):
    text = chunk["content"]
    # 检查这个 chunk 中是否包含已知的视频链接
    chunk_videos = [v for v in found_videos if v in text]
    has_video = len(chunk_videos) > 0
    video_links = chunk_videos if chunk_videos else None

    status = "🎬 有视频" if has_video else "   无视频"
    print(f"  Chunk {i}: {status}  links={video_links}")

# ==========================================
# 第四步：文档内链接解析
# ==========================================
print("\n\n【第四步】文档内链接解析")
print("-" * 40)
print("""
  test.py 的 resolve_doc_link() 函数做的事：
  - 从 chunk 文本中提取所有 Markdown 链接 [text](url)
  - 判断链接是"内部链接"（指向其他文档）还是"外部链接"
  - 内部链接记录为 related_docs（关联文档）
  - 外部链接单独记录

  为什么要做这个？
  → 当用户问问题时，如果答案涉及其他文档，可以推荐相关阅读。
""")


def resolve_doc_link(link: str) -> tuple[str, str]:
    """
    简化版的链接分类（test.py 中还会解析相对路径）
    返回: (类型, 链接)
    """
    # 外部链接
    if link.startswith(("http://", "https://", "mailto:", "#")):
        return ("external", link)
    # 去掉锚点
    link_path = link.split("#")[0]
    if not link_path:
        return ("anchor", link)
    # 内部文档链接
    return ("internal", link_path)


# 处理最后一个 chunk（包含链接的那个）
text = chunks[3]["content"]
# 用正则提取所有 Markdown 链接
all_links = re.findall(r"\[.*?\]\((.*?)\)", text)

print(f"\n  从 Chunk 3 中提取到 {len(all_links)} 个链接:")
internal_refs = []
external_links = []

for link in all_links:
    link_type, resolved = resolve_doc_link(link)
    if link_type == "internal":
        internal_refs.append(resolved)
        print(f"    📄 内部链接: {link} → related_docs")
    else:
        external_links.append(link)
        print(f"    🌐 外部链接: {link}")

print(f"\n  最终元数据:")
print(f"    related_docs = \"{', '.join(internal_refs)}\"")
print(f"    links = {external_links if external_links else None}")

# ==========================================
# 第五步：完整元数据示例
# ==========================================
print("\n\n【第五步】完整元数据 - 一个 Chunk 的全部信息")
print("-" * 40)

# 模拟一个完整的元数据对象（就是 test.py 中写入 ChromaDB 的格式）
full_metadata = {
    "source": "assign-session.md",
    "chunk_id": 2,
    "total_chunks": 4,
    "title": "Assign Session > Step-by-Step Guide",
    "chunk_position": "middle",
    "char_count": 312,
    "content_type": "steps",
    "has_steps": True,
    "has_list": True,
    "has_code": False,
    "contains_table": False,
    "has_video": True,
    "video_links": ["/videos/assign-session-demo.mp4"],
    "related_docs": None,
    "links": None,
    "tags": "assign, dashboard, sidebar, sessions, button, dropdown",
}

print()
for key, value in full_metadata.items():
    print(f"  {key:20s} = {value}")

print("""
  
  这些元数据会随文本一起存入向量数据库。
  检索时可以用元数据做过滤，回答时可以引用元数据提供额外信息。
""")

# ==========================================
# 练习
# ==========================================
print("=" * 60)
print("🎯 动手练习")
print("=" * 60)
print("""
  1. 给 content_type 添加一个新类型 "code_block"（检测 ``` 标记）
  2. 思考：chunk_position 有什么用？
     提示：文档开头通常是概述，结尾通常是总结/参考链接
  3. 如果一个 chunk 的 related_docs 指向了不存在的文件，应该怎么处理？
     提示：test.py 中 resolve_doc_link() 会检查文件是否存在
""")
