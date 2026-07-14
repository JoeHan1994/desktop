import re
from pathlib import Path
from collections import Counter

from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

# ==========================================
# 配置
# ==========================================
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # sidecar/ku -> sidecar -> desktop
DOCS_DIR = PROJECT_ROOT / "docs"

if not DOCS_DIR.exists():
    raise FileNotFoundError(f"找不到 docs 目录: {DOCS_DIR}")

# 停用词表（通用英文 + 文档格式词）
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
    "he",
    "as",
    "you",
    "do",
    "at",
    "this",
    "but",
    "his",
    "by",
    "from",
    "they",
    "we",
    "her",
    "she",
    "or",
    "an",
    "will",
    "my",
    "one",
    "all",
    "would",
    "there",
    "their",
    "what",
    "so",
    "up",
    "out",
    "if",
    "about",
    "who",
    "get",
    "which",
    "go",
    "me",
    "when",
    "make",
    "can",
    "like",
    "time",
    "no",
    "just",
    "him",
    "know",
    "take",
    "into",
    "your",
    "some",
    "could",
    "them",
    "see",
    "other",
    "than",
    "then",
    "now",
    "only",
    "come",
    "its",
    "over",
    "also",
    "back",
    "after",
    "use",
    "two",
    "how",
    "our",
    "way",
    "even",
    "new",
    "want",
    "because",
    "any",
    "these",
    "give",
    "most",
    "us",
    "is",
    "are",
    "was",
    "were",
    "been",
    "being",
    "has",
    "had",
    "does",
    "did",
    "shall",
    "should",
    "may",
    "might",
    "must",
    "need",
    "let",
    "both",
    "same",
    "own",
    "per",
    "via",
    "here",
    "each",
    "before",
    "more",
    "such",
    "through",
    "too",
    "very",
    "where",
    "those",
    "between",
    "while",
    "during",
    # 文档格式噪声词
    "click",
    "open",
    "enter",
    "sign",
    "step",
    "find",
    "type",
    "name",
    "tip",
    "warning",
    "notice",
    "media",
    "video",
    "section",
    "url",
}


def extract_tags(text: str, top_n: int = 6) -> list[str]:
    """从文本中提取高频关键词作为标签"""
    words = re.findall(r"\b[a-z]{3,}\b", text.lower())
    freq = Counter(w for w in words if w not in STOP_WORDS)
    return [w for w, _ in freq.most_common(top_n) if freq[w] >= 1]


def resolve_doc_link(link: str, current_file: Path, docs_root: Path) -> str | None:
    """将相对链接解析为 docs 内的规范化路径，非 docs 内链接返回 None"""
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


def process_markdown_file(file_path: Path, docs_root: Path) -> list[Document]:
    """处理单个 Markdown 文件，返回带元数据的 Document 列表"""
    # 计算相对于 docs 根目录的路径（保留文件夹结构）
    relative_path = file_path.relative_to(docs_root).as_posix()

    with open(file_path, "r", encoding="utf-8") as f:
        raw_content = f.read()

    print(f"\n  [处理文件] {relative_path}")
    print(f"    文件大小: {len(raw_content)} 字符")

    # 提取视频链接并替换为语义化占位符
    video_pattern = r'<video.*?>\s*<source src="(.*?)" type="video/mp4" />.*?</video>'
    found_videos = re.findall(video_pattern, raw_content, flags=re.DOTALL)

    cleaned_content = re.sub(
        video_pattern,
        lambda m: f"\n\n[Media Notice: There is an official demonstration video for this section. URL: {m.group(1)}]\n\n",
        raw_content,
        flags=re.DOTALL,
    )

    # 转换 VuePress 特有语法
    cleaned_content = (
        cleaned_content.replace("::: tip", "\n【提示】\n")
        .replace("::: warning", "\n【警告】\n")
        .replace(":::", "")
    )

    print(f"    发现视频链接: {len(found_videos)} 个")
    for v in found_videos:
        print(f"      - {v}")

    # 语义切块
    headers_to_split_on = [("#", "Header_1"), ("##", "Header_2")]
    markdown_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on
    )
    md_header_splits = markdown_splitter.split_text(cleaned_content)

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=600, chunk_overlap=100, separators=["\n\n", "\n", " ", ""]
    )
    final_chunks = text_splitter.split_documents(md_header_splits)

    print(f"    Markdown 标题切分: {len(md_header_splits)} 段")
    print(f"    递归细分后: {len(final_chunks)} 个 Chunk")

    # 构建带元数据的文档
    documents = []
    total = len(final_chunks)
    for i, chunk in enumerate(final_chunks):
        meta = chunk.metadata.copy()
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
        meta["video_links"] = chunk_videos if chunk_videos else None

        # 提取文档内链接，区分内部跨文件引用和外部链接
        chunk_links = re.findall(r"\[.*?\]\((.*?)\)", text)
        internal_refs = []
        external_links = []
        for link in chunk_links:
            resolved = resolve_doc_link(link, file_path, docs_root)
            if resolved:
                internal_refs.append(resolved)
            else:
                external_links.append(link)
        meta["related_docs"] = (
            ", ".join(sorted(set(internal_refs))) if internal_refs else None
        )
        meta["links"] = external_links if external_links else None

        # 关键词标签
        tags = extract_tags(text)
        meta["tags"] = ", ".join(tags) if tags else None

        documents.append(Document(page_content=text, metadata=meta))

    return documents


# ==========================================
# 主流程：遍历 docs 目录下所有 .md 文件（按文件夹结构递归）
# ==========================================
print(f"[开始] 扫描目录: {DOCS_DIR}")

md_files = sorted(DOCS_DIR.rglob("*.md"))
if not md_files:
    raise FileNotFoundError(f"docs 目录下未找到任何 .md 文件")

print(f"       发现 {len(md_files)} 个 Markdown 文件:")
for f in md_files:
    print(f"         - {f.relative_to(DOCS_DIR).as_posix()}")

all_documents: list[Document] = []
for md_file in md_files:
    docs = process_markdown_file(md_file, DOCS_DIR)
    all_documents.extend(docs)

# 统计汇总
video_chunks = [d for d in all_documents if d.metadata["has_video"]]
table_chunks = [d for d in all_documents if d.metadata["contains_table"]]
step_chunks = [d for d in all_documents if d.metadata["has_steps"]]
code_chunks = [d for d in all_documents if d.metadata["has_code"]]

print(f"\n[汇总] 所有文件处理完成")
print(f"       总文档数: {len(all_documents)}")
print(f"       含视频的 Chunk: {len(video_chunks)} 个")
print(f"       含表格的 Chunk: {len(table_chunks)} 个")
print(f"       含步骤的 Chunk: {len(step_chunks)} 个")
print(f"       含代码的 Chunk: {len(code_chunks)} 个")

# 按来源文件分组显示
sources = sorted(set(d.metadata["source"] for d in all_documents))
for src in sources:
    src_docs = [d for d in all_documents if d.metadata["source"] == src]
    # 汇总该文件的所有跨文件引用
    file_related = sorted(
        set(
            ref
            for d in src_docs
            if d.metadata.get("related_docs")
            for ref in d.metadata["related_docs"].split(", ")
        )
    )
    print(f"\n  [{src}] {len(src_docs)} 个 Chunk:")
    if file_related:
        print(f"    关联文档: {file_related}")
    for doc in src_docs:
        m = doc.metadata
        print(
            f"    [{m['chunk_id']:>2}/{m['total_chunks']}] "
            f"title=\"{m['title']}\" | type={m['content_type']} | pos={m['chunk_position']} | "
            f"chars={m['char_count']} | video={m['has_video']} | related={m.get('related_docs')} | tags={m.get('tags')}"
        )

# ==========================================
# 向量化写入
# ==========================================
print(f"\n[向量化] 开始写入...")
print(f"         Embedding 模型: bge-m3:567m (Ollama)")
print(f"         Ollama 地址: http://localhost:11434")

embedding_model = OllamaEmbeddings(
    model="bge-m3:latest", base_url="http://localhost:11434"
)
persist_directory = str(SCRIPT_DIR / "terraforge_knowledge_db_v2")
print(f"         存储目录: {persist_directory}")

# 清理旧数据，避免多次运行导致重复文档
import chromadb

chroma_client = chromadb.PersistentClient(path=persist_directory)
# 删除默认集合（如存在）
existing_collections = [c.name for c in chroma_client.list_collections()]
for col_name in existing_collections:
    chroma_client.delete_collection(col_name)
    print(f"         已清理旧集合: {col_name}")

db = Chroma.from_documents(
    documents=all_documents,
    embedding=embedding_model,
    persist_directory=persist_directory,
    client=chroma_client,
)

print(f"\n[完成] 写入成功!")
print(f"       ChromaDB 集合数量: {db._collection.count()}")
print(f"       覆盖文件: {len(md_files)} 个")
print(f"       总 Chunk 数: {len(all_documents)}")


# ==========================================
# RAG 问答：基于向量数据库 + Ollama qwen2.5:3b + Reranker
# ==========================================
from langchain_ollama import ChatOllama
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

llm = ChatOllama(model="qwen2.5:3b", base_url="http://localhost:11434")

# 初始化 Reranker（首次运行会自动下载模型，约 1.1GB）
# 临时指定模型缓存目录，不设置则默认存至 ~/.cache/huggingface/hub/
import os
os.environ["HF_HOME"] = str(SCRIPT_DIR / "hf_cache")

print("\n[Reranker] 加载重排序模型 (bge-reranker-v2-m3)...")
print(f"           缓存目录: {os.environ['HF_HOME']}")
reranker_tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-reranker-v2-m3")
reranker_model = AutoModelForSequenceClassification.from_pretrained(
    "BAAI/bge-reranker-v2-m3"
)
reranker_model.eval()
print("[Reranker] 模型加载完成 (bge-reranker-v2-m3, CPU, multilingual)")

# 加载已有的向量数据库（后续单独运行问答时可跳过写入阶段）
retriever = db.as_retriever(search_type="similarity", search_kwargs={"k": 4})

# 相关性分数阈值（Chroma 返回的是 L2 距离，越小越相似；此处设定最大可接受距离）
# 因为有 Reranker 二次精排，粗筛阶段可以适当放宽
RELEVANCE_DISTANCE_THRESHOLD = 1.0


def retrieve_with_scores(question: str) -> list[tuple[Document, float]]:
    """检索并返回带距离分数的文档，过滤掉不相关的结果"""
    results = db.similarity_search_with_score(question, k=4)
    # 只保留距离低于阈值的结果
    return [
        (doc, score) for doc, score in results if score < RELEVANCE_DISTANCE_THRESHOLD
    ]


def ask(question: str, docs: list[Document] | None = None) -> str:
    """根据向量数据库检索相关文档，调用 LLM 回答问题"""
    if docs is None:
        docs = list(retriever.invoke(question))

    # 构建上下文，包含元数据中的关联信息
    context_parts = []
    for i, doc in enumerate(docs):
        m = doc.metadata
        header = f"[来源: {m['source']} | 章节: {m['title']}]"
        related = f"\n  关联文档: {m['related_docs']}" if m.get("related_docs") else ""
        video = f"\n  演示视频: {m['video_links']}" if m.get("video_links") else ""
        context_parts.append(
            f"--- 片段 {i+1} {header}{related}{video}\n{doc.page_content}"
        )

    context = "\n\n".join(context_parts)

    prompt = f"""你是 Terraforge 产品文档助手。请根据以下检索到的文档片段回答用户的问题。

检索到的文档片段：
{context}

用户问题：{question}

请用中文回答：

注意：
如果文档中有关联文档或演示视频，请在回答中提及。
如果文档片段不足以回答问题，请如实说明不知道，不要编造答案。"""

    response = llm.invoke(prompt)
    return str(response.content)


# 交互式问答循环
print("\n" + "=" * 50)
print("📖 Terraforge 文档问答系统已就绪")
print("   模型: qwen2.5:3b | 向量库: ChromaDB")
print("   Reranker: bge-reranker-v2-m3 (multilingual)")
print(f"   相关性阈值: {RELEVANCE_DISTANCE_THRESHOLD} (L2 距离，越小越严格)")
print("   输入问题开始提问，输入 'q' 退出")
print("=" * 50)

while True:
    question = input("\n🔍 请输入问题: ").strip()
    if question.lower() in ("q", "quit", "exit"):
        print("👋 再见！")
        break
    if not question:
        continue
    print("\n⏳ 正在检索相关文档...")
    all_results = db.similarity_search_with_score(question, k=6)
    print(f"   阈值: {RELEVANCE_DISTANCE_THRESHOLD} | 原始检索结果:")
    for i, (doc, score) in enumerate(all_results):
        status = "✓ 通过" if score < RELEVANCE_DISTANCE_THRESHOLD else "✗ 过滤"
        print(f"     [{i+1}] 距离={score:.4f} {status} | {doc.metadata['title']}")
    results_with_scores = [
        (doc, score)
        for doc, score in all_results
        if score < RELEVANCE_DISTANCE_THRESHOLD
    ]

    if not results_with_scores:
        # 没有相关文档，直接用 LLM 回答（日常对话模式）
        print(f"\n{'─' * 50}")
        print("📚 未检索到相关文档（相关性不足），进入日常对话模式")
        print(f"{'─' * 50}")
        response = llm.invoke(question)
        print(f"\n💬 回答:\n{response.content}")
        continue

    retrieved_docs = [doc for doc, _ in results_with_scores]

    # Reranker 重排序
    print(f"\n🔄 Reranker 重排序中...")
    pairs = [[question, doc.page_content] for doc in retrieved_docs]
    with torch.no_grad():
        inputs = reranker_tokenizer(
            pairs, padding=True, truncation=True, return_tensors="pt", max_length=512
        )
        scores = (
            reranker_model(**inputs, return_dict=True).logits.view(-1).float().tolist()
        )

    # 按 reranker 分数重排文档
    reranked_docs = sorted(
        [
            (retrieved_docs[i], scores[i], results_with_scores[i][1])
            for i in range(len(retrieved_docs))
        ],
        key=lambda x: x[1],
        reverse=True,
    )

    # 格式化打印重排序结果
    print(f"\n{'─' * 50}")
    print(f"📚 Reranker 重排序后 ({len(reranked_docs)} 个片段):")
    print(f"{'─' * 50}")
    for i, (doc, rerank_score, vector_dist) in enumerate(reranked_docs):
        m = doc.metadata
        best_mark = " ⭐" if i == 0 else ""
        print(
            f"\n  ┌─ 片段 {i+1}/{len(reranked_docs)} (rerank分数: {rerank_score:.4f} | 向量距离: {vector_dist:.4f}){best_mark}"
        )
        print(f"  │ 来源: {m['source']}")
        print(f"  │ 章节: {m['title']}")
        print(
            f"  │ 类型: {m['content_type']} | 位置: {m['chunk_position']} | 字符数: {m['char_count']}"
        )
        if m.get("related_docs"):
            print(f"  │ 关联文档: {m['related_docs']}")
        if m.get("video_links"):
            print(f"  │ 演示视频: {m['video_links']}")
        if m.get("tags"):
            print(f"  │ 标签: {m['tags']}")
        preview = doc.page_content[:120].replace("\n", " ")
        print(f"  │ 预览: {preview}...")
        print(f"  └{'─' * 40}")

    # 取 reranker 排序后的最佳文档
    best_doc = reranked_docs[0][0]
    print(f"\n🤖 正在基于最佳匹配片段生成回答...")

    answer = ask(question, [best_doc])
    print(f"\n💬 回答:\n{answer}")
