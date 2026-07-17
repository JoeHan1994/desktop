"""Markdown 文档解析器：将 VitePress/VuePress 文档切分为带元数据的文本块。

从原 test.py 提取，职责：
- 预处理：视频占位符替换、VuePress 容器语法转换
- 两级切分：MarkdownHeaderTextSplitter + RecursiveCharacterTextSplitter
- 元数据富化：标题层级、内容类型、跨文件引用、TF-IDF 标签等
"""

from __future__ import annotations

import math
import re
from collections import Counter
from pathlib import Path

from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

from ...domain import Chunk, Document

# 停用词表（通用英文 + 文档格式噪声词）
STOP_WORDS = {
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for",
    "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his",
    "by", "from", "they", "we", "her", "she", "or", "an", "will", "my", "one",
    "all", "would", "there", "their", "what", "so", "up", "out", "if", "about",
    "who", "get", "which", "go", "me", "when", "make", "can", "like", "time",
    "no", "just", "him", "know", "take", "into", "your", "some", "could",
    "them", "see", "other", "than", "then", "now", "only", "come", "its",
    "over", "also", "back", "after", "use", "two", "how", "our", "way", "even",
    "new", "want", "because", "any", "these", "give", "most", "us", "is", "are",
    "was", "were", "been", "being", "has", "had", "does", "did", "shall",
    "should", "may", "might", "must", "need", "let", "both", "same", "own",
    "per", "via", "here", "each", "before", "more", "such", "through", "too",
    "very", "where", "those", "between", "while", "during",
    # 文档格式噪声词
    "click", "open", "enter", "sign", "step", "find", "type", "name", "tip",
    "warning", "notice", "media", "video", "section", "url",
}


def compute_idf(md_files: list[Path]) -> dict[str, float]:
    """基于整个文档集合计算逆文档频率（IDF），供 TF-IDF 标签提取使用。

    在多个文档中都出现的通用词（如 session、user）会得到较低的 IDF，
    只在少数文档中出现的高区分度词会得到较高的 IDF，从而让不同文档产出不同标签。
    """
    doc_count = len(md_files)
    df: Counter[str] = Counter()
    for file_path in md_files:
        content = file_path.read_text(encoding="utf-8").lower()
        words = set(re.findall(r"\b[a-z]{3,}\b", content))
        for w in words:
            if w not in STOP_WORDS:
                df[w] += 1
    # 平滑处理，避免除零；出现文档数越多，权重越低
    return {w: math.log((doc_count + 1) / (freq + 1)) + 1 for w, freq in df.items()}


def extract_tags(text: str, idf: dict[str, float], top_n: int = 6) -> list[str]:
    """基于 TF-IDF 从文本中提取具有区分度的关键词作为标签。"""
    words = re.findall(r"\b[a-z]{3,}\b", text.lower())
    tf = Counter(w for w in words if w not in STOP_WORDS)
    if not tf:
        return []
    # TF-IDF 打分：词频 × 逆文档频率（未在语料中出现的词默认给中性权重 1.0）
    scores = {w: count * idf.get(w, 1.0) for w, count in tf.items()}
    ranked = sorted(scores.items(), key=lambda x: (x[1], x[0]), reverse=True)
    return [w for w, _ in ranked[:top_n]]


def resolve_doc_link(link: str, current_file: Path, docs_root: Path) -> str | None:
    """将相对链接解析为 docs 内的规范化路径，非 docs 内链接返回 None。"""
    # 跳过外部链接和锚点
    if link.startswith(("http://", "https://", "mailto:", "#")):
        return None
    # 去掉锚点部分
    link_path = link.split("#")[0]
    if not link_path:
        return None
    # 基于当前文件所在目录解析相对路径
    resolved = (current_file.parent / link_path).resolve()
    # 尝试补 .md 后缀（VuePress 风格链接不带后缀）
    if not resolved.suffix:
        resolved = resolved.with_suffix(".md")
    # 检查是否在 docs 目录内且文件存在
    try:
        rel = resolved.relative_to(docs_root.resolve())
        if resolved.exists():
            return rel.as_posix()
    except ValueError:
        pass
    return None


def parse_markdown_file(
    file_path: Path, docs_root: Path, idf: dict[str, float]
) -> Document:
    """解析单个 Markdown 文件，返回带元数据文本块的 Document。"""
    relative_path = file_path.relative_to(docs_root).as_posix()
    raw_content = file_path.read_text(encoding="utf-8")

    # 提取视频链接并替换为语义化占位符
    video_pattern = r'<video.*?>\s*<source src="(.*?)" type="video/mp4" />.*?</video>'
    found_videos = re.findall(video_pattern, raw_content, flags=re.DOTALL)

    cleaned_content = re.sub(
        video_pattern,
        lambda m: (
            "\n\n[Media Notice: There is an official demonstration video for "
            f"this section. URL: {m.group(1)}]\n\n"
        ),
        raw_content,
        flags=re.DOTALL,
    )

    # 转换 VuePress 特有语法
    cleaned_content = (
        cleaned_content.replace("::: tip", "\n【提示】\n")
        .replace("::: warning", "\n【警告】\n")
        .replace("::: danger", "\n【危险】\n")
        .replace(":::", "")
    )

    # 语义切块：先按标题，再递归细分
    headers_to_split_on = [("#", "Header_1"), ("##", "Header_2")]
    markdown_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on
    )
    md_header_splits = markdown_splitter.split_text(cleaned_content)

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=600, chunk_overlap=100, separators=["\n\n", "\n", " ", ""]
    )
    final_chunks = text_splitter.split_documents(md_header_splits)

    chunks: list[Chunk] = []
    total = len(final_chunks)
    for i, chunk in enumerate(final_chunks):
        meta = dict(chunk.metadata)
        text = chunk.page_content
        meta["source"] = relative_path
        meta["chunk_id"] = i
        meta["total_chunks"] = total

        # 从 Header 层级拼出可读标题
        title_parts = [meta[k] for k in ("Header_1", "Header_2") if k in meta]
        meta["title"] = " > ".join(title_parts) if title_parts else relative_path

        # 位置标记
        if i == 0:
            meta["chunk_position"] = "start"
        elif i == total - 1:
            meta["chunk_position"] = "end"
        else:
            meta["chunk_position"] = "middle"

        meta["char_count"] = len(text)

        # 内容类型推断
        has_ordered_list = bool(re.search(r"^\d+\.\s", text, re.MULTILINE))
        has_unordered_list = bool(re.search(r"^[-*]\s", text, re.MULTILINE))
        meta["has_steps"] = has_ordered_list
        meta["has_list"] = has_ordered_list or has_unordered_list
        meta["has_code"] = "`" in text
        meta["contains_table"] = "|" in text and "---" in text

        if meta["contains_table"]:
            meta["content_type"] = "table"
        elif meta["has_steps"]:
            meta["content_type"] = "steps"
        elif meta["has_list"]:
            meta["content_type"] = "list"
        else:
            meta["content_type"] = "text"

        # 视频占位符检查
        chunk_videos = [v for v in found_videos if v in text]
        meta["has_video"] = len(chunk_videos) > 0
        meta["video_links"] = ", ".join(chunk_videos) if chunk_videos else None

        # 提取文档内链接，区分内部跨文件引用和外部链接
        chunk_links = re.findall(r"\[.*?\]\((.*?)\)", text)
        internal_refs: list[str] = []
        external_links: list[str] = []
        for link in chunk_links:
            resolved = resolve_doc_link(link, file_path, docs_root)
            if resolved:
                internal_refs.append(resolved)
            else:
                external_links.append(link)
        meta["related_docs"] = (
            ", ".join(sorted(set(internal_refs))) if internal_refs else None
        )
        meta["links"] = ", ".join(external_links) if external_links else None

        # 关键词标签（TF-IDF，跨文档区分）
        tags = extract_tags(text, idf)
        meta["tags"] = ", ".join(tags) if tags else None

        chunks.append(Chunk(text=text, source=relative_path, metadata=meta))

    return Document(source=relative_path, raw=raw_content, chunks=chunks)


def parse_docs_directory(docs_dir: Path) -> list[Document]:
    """遍历 docs 目录下所有 .md 文件（保留文件夹结构），返回解析后的文档列表。"""
    md_files = sorted(docs_dir.rglob("*.md"))
    if not md_files:
        raise FileNotFoundError(f"docs 目录下未找到任何 .md 文件: {docs_dir}")
    idf = compute_idf(md_files)
    return [parse_markdown_file(f, docs_dir, idf) for f in md_files]
