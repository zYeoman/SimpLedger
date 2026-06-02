#!/usr/bin/env python3
"""Convert Elephant Bookkeeping SQLite data to this app's import JSON."""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


COLORS = [
    "#d95f43",
    "#df5750",
    "#c24b5a",
    "#c28a2c",
    "#5f8f5f",
    "#2f7d62",
    "#3d8b93",
    "#3a8d8f",
    "#4776b4",
    "#8b68b8",
    "#b45f9d",
    "#8c6b4f",
    "#455160",
    "#6f7680",
]

ICON_BY_KEYWORD = {
    "hamburger": "hamburger",
    "drink": "drink",
    "apple": "fruit",
    "ice": "ice",
    "pisa": "pizza",
    "eat": "eat",
    "cart": "cart",
    "bike": "bike",
    "train": "train",
    "fly": "fly",
    "park": "taxi",
    "bus": "traffic",
    "car": "car",
    "traffic": "traffic",
    "bag": "bag",
    "camera": "shop",
    "shop": "shop",
    "house": "house",
    "water": "water",
    "safe": "safe",
    "life": "daily",
    "pill": "pill",
    "hospital": "hospital",
    "medical": "health",
    "game": "happy",
    "movie": "film",
    "fitness": "fitness",
    "happy": "happy",
    "education": "education",
    "book": "book",
    "salary": "salary",
    "awards": "awards",
    "cash": "cash",
    "refund": "refund",
    "dividends": "dividends",
    "manage": "manage",
    "sale": "sale",
    "income": "income",
}


def money_from_cents(value: int | None) -> float:
    return round((value or 0) / 100, 2)


def date_from_millis(value: int | None) -> str:
    if not value:
        return datetime.now().date().isoformat()
    return datetime.fromtimestamp(value / 1000).date().isoformat()


def iso_from_millis(value: int | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat()


def icon_from_img_name(img_name: str | None) -> str:
    source = (img_name or "").lower()
    for keyword, icon in ICON_BY_KEYWORD.items():
        if keyword in source:
            return icon
    return "wallet"


def fetch_rows(conn: sqlite3.Connection, sql: str) -> list[sqlite3.Row]:
    return list(conn.execute(sql))


def build_payload(db_path: Path) -> dict[str, Any]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        assets = fetch_rows(conn, "select id, name, create_time from Assets order by ranking, id")
        types = fetch_rows(conn, "select id, name, img_name, type, ranking from RecordType order by type, ranking, id")
        records = fetch_rows(
            conn,
            """
            select
              r.money,
              r.remark,
              r.time,
              r.create_time,
              rt.name as category_name,
              rt.img_name as category_img_name,
              rt.type as category_type,
              a.name as account_name
            from Record r
            join RecordType rt on rt.id = r.record_type_id
            left join Assets a on a.id = r.assets_id
            order by r.time, r.id
            """,
        )
    finally:
        conn.close()

    accounts = []
    seen_accounts = set()
    for asset in assets:
        name = (asset["name"] or "默认资产").strip()
        if name in seen_accounts:
            continue
        seen_accounts.add(name)
        accounts.append(
            {
                "name": name,
                "createdAt": iso_from_millis(asset["create_time"]),
            }
        )

    category_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    color_index = 0
    for row in types:
        name = (row["name"] or "其他").strip()
        tx_type = "income" if row["type"] == 1 else "expense"
        key = (name, tx_type)
        if key in category_by_key:
            continue
        category_by_key[key] = {
            "name": name,
            "type": tx_type,
            "color": COLORS[color_index % len(COLORS)],
            "icon": icon_from_img_name(row["img_name"]),
        }
        color_index += 1

    transactions = []
    for row in records:
        category_name = (row["category_name"] or "其他").strip()
        tx_type = "income" if row["category_type"] == 1 else "expense"
        account_name = (row["account_name"] or "默认资产").strip()
        if account_name and account_name not in seen_accounts:
            seen_accounts.add(account_name)
            accounts.append({"name": account_name, "createdAt": iso_from_millis(row["create_time"])})
        key = (category_name, tx_type)
        if key not in category_by_key:
            category_by_key[key] = {
                "name": category_name,
                "type": tx_type,
                "color": COLORS[color_index % len(COLORS)],
                "icon": icon_from_img_name(row["category_img_name"]),
            }
            color_index += 1
        transactions.append(
            {
                "type": tx_type,
                "amount": money_from_cents(row["money"]),
                "category": category_name,
                "account": account_name,
                "note": row["remark"] or "",
                "date": date_from_millis(row["time"]),
                "createdAt": iso_from_millis(row["create_time"] or row["time"]),
                "updatedAt": iso_from_millis(row["create_time"] or row["time"]),
            }
        )

    return {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "app": "local-money",
        "version": 1,
        "transactions": transactions,
        "categories": list(category_by_key.values()),
        "accounts": accounts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Elephant Bookkeeping SQLite DB to local-money import JSON.")
    parser.add_argument("db", nargs="?", default="ElephantBookkeeping/MoneyKeeper.db", help="Path to MoneyKeeper.db")
    parser.add_argument("-o", "--output", default="elephant_import.json", help="Output JSON path")
    args = parser.parse_args()

    db_path = Path(args.db)
    output_path = Path(args.output)
    payload = build_payload(db_path)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Wrote {output_path}: "
        f"{len(payload['transactions'])} transactions, "
        f"{len(payload['categories'])} categories, "
        f"{len(payload['accounts'])} accounts"
    )


if __name__ == "__main__":
    main()
