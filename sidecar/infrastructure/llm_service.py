"""LLM 服务：问题翻译与意图过滤参数提取。

封装流程图阶段二中两个 LLM 预处理步骤：
  步骤 2 - translate()       : 检测中文输入并翻译为英文
  步骤 3 - extract_filters() : 解析用户意图，提取 Qdrant 元数据过滤参数（YAML 提示词 1）
                               运行时将入库阶段生成的 metadata_catalog.json 注入提示词，
                               使 LLM 能基于真实词表和可用字段值做出准确的过滤选择。
  属性  - answer_prompt      : 暴露回答生成提示词配置（YAML 提示词 2，供 QaService 使用）
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from . import config
from ..domain.search import FilterParams

# intent_filter.yaml 中的占位符，运行时替换为实际元数据清单
_CATALOG_PLACEHOLDER = "__CATALOG_REFERENCE__"


def _load_prompt(yaml_path: str | Path) -> dict[str, str]:
    """加载 YAML 格式的提示词配置，返回包含 system / user_template 键的字典。"""
    with Path(yaml_path).open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _has_chinese(text: str) -> bool:
    """检测文本中是否含有 CJK 统一汉字。"""
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def _load_catalog(path: str) -> dict[str, Any]:
    """读取入库阶段生成的 metadata_catalog.json；文件不存在时返回空默认值。"""
    catalog_path = Path(path)
    if catalog_path.exists():
        try:
            return json.loads(catalog_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"tags": [], "has_video": False, "has_code": False,
            "has_steps": False, "contains_table": False}


def _build_catalog_reference(catalog: dict[str, Any]) -> str:
    """将 catalog 转换为注入提示词的参考文本。

    格式示例：
      {
        "has_video":      true | false | null  [available in KB],
        "has_code":       true | false | null  [NOT in KB],
        "has_steps":      true | false | null  [available in KB],
        "contains_table": true | false | null  [NOT in KB],
        "tags": pick 0-3 from ["assign", "checkout", "connect", ...]
      }
    """
    bool_fields = [
        ("has_video",      catalog.get("has_video",      False)),
        ("has_code",       catalog.get("has_code",       False)),
        ("has_steps",      catalog.get("has_steps",      False)),
        ("contains_table", catalog.get("contains_table", False)),
    ]
    lines: list[str] = []
    for field, available in bool_fields:
        note = "available in KB" if available else "NOT in KB"
        lines.append(f'  "{field}": true | false | null  [{note}]')

    tags: list[str] = catalog.get("tags", [])
    if tags:
        # 最多展示 60 个标签，避免 prompt 过长
        sample = tags[:60]
        tag_list = ", ".join(f'"{t}"' for t in sample)
        suffix = f"  ... and {len(tags) - 60} more" if len(tags) > 60 else ""
        lines.append(f'  "tags": pick 0-3 from [{tag_list}]{suffix}')
    else:
        lines.append('  "tags": []')

    return "{\n" + ",\n".join(lines) + "\n}"


class LlmService:
    """封装翻译与意图过滤提取的 LLM 调用（惰性初始化，启动时不加载模型）。"""

    def __init__(
        self,
        model: str = config.LLM_MODEL,
        translate_model: str = config.TRANSLATE_MODEL,
        base_url: str = config.OLLAMA_BASE_URL,
    ) -> None:
        self._llm = ChatOllama(model=model, base_url=base_url, reasoning=False)
        if translate_model == model:
            self._translate_llm = self._llm
        else:
            self._translate_llm = ChatOllama(
                model=translate_model, base_url=base_url, reasoning=False
            )
        self._intent_prompt: dict[str, str] = _load_prompt(config.INTENT_FILTER_PROMPT)
        self._answer_prompt: dict[str, str] = _load_prompt(config.ANSWER_PROMPT)
        self._catalog_path: str = config.METADATA_CATALOG_PATH

    # ── 步骤 2：翻译 ────────────────────────────────────────────────────────

    def translate(self, text: str) -> str:
        """将文本翻译为英文；若未检测到中文则原样返回（避免不必要的 LLM 调用）。"""
        if not _has_chinese(text):
            return text
        msg = HumanMessage(
            content=(
                "Translate the following Chinese text to English. "
                "Output ONLY the translated text, no explanation:\n\n" + text
            )
        )
        result = self._translate_llm.invoke([msg])
        return str(result.content).strip()

    # ── 步骤 3：意图解析与过滤提取 ──────────────────────────────────────────

    def extract_filters(self, question_en: str) -> FilterParams:
        """调用 LLM（YAML 提示词 1）从英文问题中提取元数据过滤参数。

        在调用前将 metadata_catalog.json 中的真实词表注入提示词，使 LLM 能从
        实际标签词表中选取 tags，并了解哪些布尔字段在当前 KB 中有内容可过滤。
        LLM 输出 JSON，解析失败时返回空 FilterParams（不过滤）。
        """
        # 加载最新 catalog 并构建参考文本
        catalog = _load_catalog(self._catalog_path)
        catalog_ref = _build_catalog_reference(catalog)

        # 将占位符替换为真实清单
        system = self._intent_prompt["system"].replace(_CATALOG_PLACEHOLDER, catalog_ref)
        user_text = self._intent_prompt["user_template"].format(question=question_en)

        messages = [
            SystemMessage(content=system),
            HumanMessage(content=user_text),
        ]
        result = self._llm.invoke(messages)
        raw = str(result.content).strip()

        print(f"[IntentFilter] LLM 原始输出: {raw}")

        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            print("[IntentFilter] 未找到 JSON，返回空过滤器")
            return FilterParams()
        try:
            data: dict[str, Any] = json.loads(match.group())
            # 验证 tags 来自已知词表（防止 LLM 幻觉）
            known_tags: set[str] = set(catalog.get("tags", []))
            raw_tags: list[str] = data.get("tags") or []
            valid_tags = [t for t in raw_tags if t in known_tags] if known_tags else raw_tags
            filters = FilterParams(
                has_video=data.get("has_video"),
                has_code=data.get("has_code"),
                has_steps=data.get("has_steps"),
                contains_table=data.get("contains_table"),
                tags=valid_tags,
            )
            print(f"[IntentFilter] 解析结果: {filters}")
            return filters
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            print(f"[IntentFilter] JSON 解析失败 ({exc})，返回空过滤器")
            return FilterParams()

    # ── 提示词 2 暴露给 QaService ───────────────────────────────────────────

    @property
    def answer_prompt(self) -> dict[str, str]:
        """返回回答生成提示词配置（YAML 提示词 2）。"""
        return self._answer_prompt
