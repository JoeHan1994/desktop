"""PDF 文档解析器：提取文本并切分为带元数据的文本块。

依赖 pypdf（需在 requirements.txt 中声明）。
每页文本视为一个逻辑单元，再由 RecursiveCharacterTextSplitter 进一步切分。
"""

from __future__ import annotations

from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

from ...domain import Chunk, Document
from .markdown_parser import extract_tags

_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)


def parse_pdf_file(
    file_path: Path, docs_root: Path, idf: dict[str, float]
) -> Document:
    """解析单个 PDF 文件，返回带元数据文本块的 Document。"""
    try:
        import pypdf  # 延迟导入，避免未安装时影响启动
    except ImportError as exc:
        raise ImportError("PDF 解析需要 pypdf，请运行: pip install pypdf") from exc

    relative_path = file_path.relative_to(docs_root).as_posix()
    reader = pypdf.PdfReader(str(file_path))

    pages_text: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            pages_text.append(text)

    raw = "\n\n".join(pages_text)
    lc_chunks = _SPLITTER.create_documents([raw])

    chunks: list[Chunk] = []
    for lc_chunk in lc_chunks:
        text = lc_chunk.page_content
        tags = extract_tags(text, idf)
        chunks.append(
            Chunk(
                text=text,
                source=relative_path,
                metadata={
                    "title": file_path.stem,
                    "file_type": "pdf",
                    "has_code": False,
                    "has_steps": False,
                    "has_video": False,
                    "contains_table": False,
                    "tags": ", ".join(tags) if tags else None,
                },
            )
        )
    return Document(source=relative_path, raw=raw, chunks=chunks)
