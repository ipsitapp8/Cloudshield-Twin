"""SQLite persistence for snapshots and events. Keeps the latest MAX_SNAPSHOTS rows."""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

MAX_SNAPSHOTS = 200


class Store:
    def __init__(self, db_path: str | Path = ":memory:"):
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                kind TEXT NOT NULL,
                payload TEXT NOT NULL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                type TEXT NOT NULL,
                payload TEXT NOT NULL
            )"""
        )
        self._conn.commit()

    def add_snapshot(self, kind: str, payload: dict, ts: float | None = None) -> int:
        ts = ts if ts is not None else time.time()
        cur = self._conn.execute(
            "INSERT INTO snapshots (ts, kind, payload) VALUES (?, ?, ?)",
            (ts, kind, json.dumps(payload)),
        )
        self._conn.commit()
        self._trim(kind)
        assert cur.lastrowid is not None
        return cur.lastrowid

    def _trim(self, kind: str, keep: int = MAX_SNAPSHOTS) -> None:
        self._conn.execute(
            """DELETE FROM snapshots WHERE kind = ? AND id NOT IN (
                SELECT id FROM snapshots WHERE kind = ? ORDER BY id DESC LIMIT ?
            )""",
            (kind, kind, keep),
        )
        self._conn.commit()

    def latest_snapshot(self, kind: str) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM snapshots WHERE kind = ? ORDER BY id DESC LIMIT 1", (kind,)
        ).fetchone()
        return self._row_to_snapshot(row) if row else None

    def list_snapshots(self, kind: str, limit: int = MAX_SNAPSHOTS) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM snapshots WHERE kind = ? ORDER BY id DESC LIMIT ?", (kind, limit)
        ).fetchall()
        return [self._row_to_snapshot(r) for r in rows]

    def count_snapshots(self, kind: str) -> int:
        row = self._conn.execute("SELECT COUNT(*) AS c FROM snapshots WHERE kind = ?", (kind,)).fetchone()
        return row["c"]

    def add_event(self, type_: str, payload: dict, ts: float | None = None) -> int:
        ts = ts if ts is not None else time.time()
        cur = self._conn.execute(
            "INSERT INTO events (ts, type, payload) VALUES (?, ?, ?)",
            (ts, type_, json.dumps(payload)),
        )
        self._conn.commit()
        assert cur.lastrowid is not None
        return cur.lastrowid

    def list_events(self, limit: int = 100) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [
            {"id": r["id"], "ts": r["ts"], "type": r["type"], "payload": json.loads(r["payload"])}
            for r in rows
        ]

    @staticmethod
    def _row_to_snapshot(row: sqlite3.Row) -> dict:
        return {"id": row["id"], "ts": row["ts"], "kind": row["kind"], "payload": json.loads(row["payload"])}

    def close(self) -> None:
        self._conn.close()
