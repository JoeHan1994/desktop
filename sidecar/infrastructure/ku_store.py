"""KU (Knowledge Unit) SQLite 存储层。

维护两张表：
  - ku         : 知识单元，每个文档对应一条记录
  - chunk      : 文本块摘要，每个 chunk 对应一条记录，关联 ku

数据库文件默认位于 sidecar/terraforge_ku.db。
"""

from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator

from . import config

DB_PATH = Path(config.SIDECAR_DIR) / "terraforge_ku.db"

# ── DDL ───────────────────────────────────────────────────────────────────

_CREATE_KU_TABLE = """
CREATE TABLE IF NOT EXISTS ku (
    kuid        TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    filepath    TEXT NOT NULL,
    project_name TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
"""

_CREATE_CHUNK_TABLE = """
CREATE TABLE IF NOT EXISTS chunk (
    chunk_id    TEXT PRIMARY KEY,
    kuid        TEXT NOT NULL,
    raw_text    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (kuid) REFERENCES ku(kuid)
);
"""


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db() -> None:
    """建库建表（幂等）。"""
    with _conn() as con:
        con.execute(_CREATE_KU_TABLE)
        con.execute(_CREATE_CHUNK_TABLE)


# ── KU 操作 ───────────────────────────────────────────────────────────────

def upsert_ku(
    filename: str,
    filepath: str,
    project_name: str = "",
    tags: str = "",
    kuid: str | None = None,
) -> str:
    """插入或更新 KU 记录，返回 kuid。

    若 filepath 已存在则更新 project_name / tags，否则新建。
    """
    init_db()
    with _conn() as con:
        row = con.execute(
            "SELECT kuid FROM ku WHERE filepath = ?", (filepath,)
        ).fetchone()
        if not row:
            # 文件路径不同但文件名相同，直接覆盖已有记录
            row = con.execute(
                "SELECT kuid FROM ku WHERE filename = ?", (filename,)
            ).fetchone()
        if row:
            existing_id: str = row["kuid"]
            con.execute(
                "UPDATE ku SET filename=?, project_name=?, tags=? WHERE kuid=?",
                (filename, project_name, tags, existing_id),
            )
            return existing_id
        new_id = kuid or str(uuid.uuid4())
        con.execute(
            "INSERT INTO ku (kuid, filename, filepath, project_name, tags) VALUES (?,?,?,?,?)",
            (new_id, filename, filepath, project_name, tags),
        )
        return new_id


def list_kus() -> list[dict[str, Any]]:
    """返回全部 KU 记录（含 chunk 统计）。"""
    init_db()
    with _conn() as con:
        rows = con.execute(
            """
            SELECT k.kuid, k.filename, k.filepath, k.project_name, k.tags, k.created_at,
                   COUNT(c.chunk_id) AS chunk_count
            FROM ku k
            LEFT JOIN chunk c ON c.kuid = k.kuid
            GROUP BY k.kuid
            ORDER BY k.created_at DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def get_ku(kuid: str) -> dict[str, Any] | None:
    """按 kuid 查询 KU。"""
    init_db()
    with _conn() as con:
        row = con.execute("SELECT * FROM ku WHERE kuid=?", (kuid,)).fetchone()
    return dict(row) if row else None


def delete_ku(kuid: str) -> None:
    """删除 KU 及其关联 chunk 记录。"""
    init_db()
    with _conn() as con:
        con.execute("DELETE FROM chunk WHERE kuid=?", (kuid,))
        con.execute("DELETE FROM ku WHERE kuid=?", (kuid,))


# ── Chunk 操作 ────────────────────────────────────────────────────────────

def insert_chunk(chunk_id: str, kuid: str, raw_text: str) -> None:
    """插入 chunk 记录（若 chunk_id 已存在则跳过）。"""
    init_db()
    with _conn() as con:
        con.execute(
            "INSERT OR IGNORE INTO chunk (chunk_id, kuid, raw_text) VALUES (?,?,?)",
            (chunk_id, kuid, raw_text),
        )


def list_chunks(kuid: str) -> list[dict[str, Any]]:
    """返回某 KU 下全部 chunk 记录。"""
    init_db()
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM chunk WHERE kuid=? ORDER BY created_at ASC",
            (kuid,),
        ).fetchall()
    return [dict(r) for r in rows]


def clear_chunks(kuid: str) -> None:
    """清空某 KU 下全部 chunk（重新入库前调用）。"""
    init_db()
    with _conn() as con:
        con.execute("DELETE FROM chunk WHERE kuid=?", (kuid,))


def clear_all() -> None:
    """清空 ku 和 chunk 表中的所有记录（删库时配套使用）。"""
    init_db()
    with _conn() as con:
        con.execute("DELETE FROM chunk")
        con.execute("DELETE FROM ku")


def db_stats() -> dict[str, int]:
    """返回 ku / chunk 表记录数。"""
    init_db()
    with _conn() as con:
        ku_count: int = con.execute("SELECT COUNT(*) FROM ku").fetchone()[0]
        chunk_count: int = con.execute("SELECT COUNT(*) FROM chunk").fetchone()[0]
    return {"ku_count": ku_count, "chunk_count": chunk_count}
