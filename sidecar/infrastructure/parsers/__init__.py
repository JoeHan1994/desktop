"""文档解析器子包：支持 Markdown、PDF、DOCX 三种格式。"""

from pathlib import Path

from ...domain import Document
from .markdown_parser import (
    compute_idf,
    extract_tags,
    parse_docs_directory as _parse_md_dir,
    parse_markdown_file,
    resolve_doc_link,
)
from .pdf_parser import parse_pdf_file
from .docx_parser import parse_docx_file

_SUPPORTED_SUFFIXES = {".md", ".pdf", ".docx"}


def parse_docs_directory(docs_dir: Path) -> list[Document]:
    """遍历目录，按文件格式路由到对应解析器，返回所有解析后的文档列表。

    支持格式：
      .md   → Markdown 解析器（带 TF-IDF 标签、章节元数据）
      .pdf  → PDF 解析器（需 pypdf）
      .docx → DOCX 解析器（需 python-docx）
    """
    all_files = sorted(
        f for f in docs_dir.rglob("*")
        if f.is_file() and f.suffix.lower() in _SUPPORTED_SUFFIXES
    )
    if not all_files:
        raise FileNotFoundError(
            f"目录下未找到支持的文档（.md / .pdf / .docx）: {docs_dir}"
        )

    md_files = [f for f in all_files if f.suffix.lower() == ".md"]
    idf = compute_idf(md_files) if md_files else {}

    documents: list[Document] = []
    for f in all_files:
        suffix = f.suffix.lower()
        if suffix == ".md":
            documents.append(parse_markdown_file(f, docs_dir, idf))
        elif suffix == ".pdf":
            documents.append(parse_pdf_file(f, docs_dir, idf))
        elif suffix == ".docx":
            documents.append(parse_docx_file(f, docs_dir, idf))
    return documents


__all__ = [
    "compute_idf",
    "extract_tags",
    "resolve_doc_link",
    "parse_markdown_file",
    "parse_pdf_file",
    "parse_docx_file",
    "parse_docs_directory",
]

