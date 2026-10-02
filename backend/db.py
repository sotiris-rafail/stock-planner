"""SQLite persistence for buys, sells, and FIFO lot reductions."""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "portfolio.db"

_DB_LOCK = threading.RLock()
_DB_CONN: sqlite3.Connection | None = None


def _open_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _get_conn() -> sqlite3.Connection:
    global _DB_CONN
    if _DB_CONN is None:
        _DB_CONN = _open_conn()
    return _DB_CONN


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    """Reuse one SQLite connection so each request does not leak a file descriptor."""
    global _DB_CONN
    with _DB_LOCK:
        try:
            conn = _get_conn()
            yield conn
            conn.commit()
        except Exception:
            if _DB_CONN is not None:
                try:
                    _DB_CONN.rollback()
                except Exception:
                    pass
            raise


def close_db() -> None:
    global _DB_CONN
    with _DB_LOCK:
        if _DB_CONN is not None:
            _DB_CONN.close()
            _DB_CONN = None


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row["name"] for row in rows}


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_encrypted TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                company_name TEXT,
                currency TEXT NOT NULL DEFAULT 'USD',
                shares REAL NOT NULL CHECK (shares > 0),
                price_per_share REAL NOT NULL CHECK (price_per_share > 0),
                purchased_at TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        columns = _table_columns(conn, "purchases")
        if "currency" not in columns:
            conn.execute(
                "ALTER TABLE purchases ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                company_name TEXT,
                currency TEXT NOT NULL DEFAULT 'USD',
                shares REAL NOT NULL CHECK (shares > 0),
                price_per_share REAL NOT NULL CHECK (price_per_share > 0),
                sold_at TEXT NOT NULL,
                cost_basis REAL NOT NULL,
                proceeds REAL NOT NULL,
                realized_gain REAL NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_purchases_symbol ON purchases(symbol)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchased_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_purchases_currency ON purchases(currency)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sales_symbol ON sales(symbol)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sold_at)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS suggestion_cache (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dividend_ideas_cache (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                requested_symbol TEXT,
                company_name TEXT,
                asset_type TEXT NOT NULL DEFAULT 'stock',
                currency TEXT NOT NULL DEFAULT 'USD',
                added_at TEXT NOT NULL,
                price_at_add REAL NOT NULL CHECK (price_at_add > 0),
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_watchlist_added ON watchlist_items(added_at)"
        )


        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_watchlist_added ON watchlist_items(added_at)"
        )
        _migrate_user_scope(conn)


def _migrate_user_scope(conn: sqlite3.Connection) -> None:
    for table in ("purchases", "sales"):
        columns = _table_columns(conn, table)
        if "user_id" not in columns:
            conn.execute(
                f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{table}_user ON {table}(user_id)"
            )

    watchlist_columns = _table_columns(conn, "watchlist_items")
    if "user_id" not in watchlist_columns:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist_items_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                symbol TEXT NOT NULL,
                requested_symbol TEXT,
                company_name TEXT,
                asset_type TEXT NOT NULL DEFAULT 'stock',
                currency TEXT NOT NULL DEFAULT 'USD',
                added_at TEXT NOT NULL,
                price_at_add REAL NOT NULL CHECK (price_at_add > 0),
                created_at TEXT NOT NULL,
                UNIQUE(user_id, symbol)
            )
            """
        )
        conn.execute("DROP TABLE IF EXISTS watchlist_items")
        conn.execute("ALTER TABLE watchlist_items_v2 RENAME TO watchlist_items")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_watchlist_user_added ON watchlist_items(user_id, added_at)"
        )

    dividend_columns = _table_columns(conn, "dividend_ideas_cache")
    if "user_id" not in dividend_columns:
        conn.execute("DROP TABLE IF EXISTS dividend_ideas_cache")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dividend_ideas_cache (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_settings (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            monthly_report_enabled INTEGER NOT NULL DEFAULT 0,
            report_email TEXT NOT NULL DEFAULT '',
            last_sent_month TEXT
        )
        """
    )


def create_user(*, email_encrypted: str, password_hash: str) -> int:
    created_at = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO users (email_encrypted, password_hash, created_at)
            VALUES (?, ?, ?)
            """,
            (email_encrypted, password_hash, created_at),
        )
        return int(cur.lastrowid)


def get_user_by_id(user_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, email_encrypted, password_hash, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


def get_user_by_encrypted_email(email_encrypted: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT id, email_encrypted, password_hash, created_at
            FROM users
            WHERE email_encrypted = ?
            """,
            (email_encrypted,),
        ).fetchone()
    return dict(row) if row else None


def list_users() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, email_encrypted, password_hash, created_at
            FROM users
            ORDER BY id
            """
        ).fetchall()
    return [dict(row) for row in rows]


def update_user_password(*, user_id: int, password_hash: str) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id),
        )
        return cur.rowcount > 0


def add_purchase(
    *,
    user_id: int,
    symbol: str,
    company_name: str | None,
    currency: str,
    shares: float,
    price_per_share: float,
    purchased_at: str,
    notes: str | None = None,
) -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO purchases
                (user_id, symbol, company_name, currency, shares, price_per_share, purchased_at, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                symbol.upper().strip(),
                company_name,
                (currency or "USD").upper().strip(),
                shares,
                price_per_share,
                purchased_at,
                notes,
                created_at,
            ),
        )
        purchase_id = cur.lastrowid
    return get_purchase(purchase_id, user_id=user_id)


def get_purchase(purchase_id: int, *, user_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM purchases WHERE id = ? AND user_id = ?",
            (purchase_id, user_id),
        ).fetchone()
    return _purchase_to_dict(row) if row else None


def get_sale(sale_id: int, *, user_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM sales WHERE id = ? AND user_id = ?",
            (sale_id, user_id),
        ).fetchone()
    return _sale_to_dict(row) if row else None


def owned_shares(symbol: str, *, user_id: int) -> float:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT COALESCE(SUM(shares), 0) AS n
            FROM purchases
            WHERE symbol = ? AND user_id = ?
            """,
            (symbol.upper().strip(), user_id),
        ).fetchone()
    return float(row["n"] if row else 0)


def list_positions(*, user_id: int) -> list[dict]:
    """Open positions grouped by symbol from remaining buy lots."""
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
                symbol,
                MAX(company_name) AS company_name,
                MAX(currency) AS currency,
                SUM(shares) AS shares,
                SUM(shares * price_per_share) AS invested
            FROM purchases
            WHERE user_id = ?
            GROUP BY symbol
            HAVING SUM(shares) > 0
            ORDER BY symbol
            """,
            (user_id,),
        ).fetchall()
    positions = []
    for row in rows:
        shares = float(row["shares"])
        invested = float(row["invested"])
        positions.append(
            {
                "symbol": row["symbol"],
                "company_name": row["company_name"],
                "currency": (row["currency"] or "USD").upper(),
                "shares": round(shares, 6),
                "invested": round(invested, 2),
                "avg_cost_per_share": round(invested / shares, 4) if shares else 0.0,
            }
        )
    return positions


def execute_sale(
    *,
    user_id: int,
    symbol: str,
    shares: float,
    price_per_share: float,
    sold_at: str,
    notes: str | None = None,
    company_name: str | None = None,
    currency: str | None = None,
) -> dict:
    """
    Sell shares using FIFO against remaining buy lots.

    Reduces/deletes purchase lots oldest-first and records a sale with realized gain.
    """
    symbol = symbol.upper().strip()
    if shares <= 0:
        raise ValueError("shares must be positive")
    if price_per_share <= 0:
        raise ValueError("price_per_share must be positive")

    with _connect() as conn:
        lots = conn.execute(
            """
            SELECT * FROM purchases
            WHERE symbol = ? AND user_id = ?
            ORDER BY purchased_at ASC, id ASC
            """,
            (symbol, user_id),
        ).fetchall()
        owned = sum(float(lot["shares"]) for lot in lots)
        # Allow tiny float tolerance
        if shares > owned + 1e-9:
            raise ValueError(
                f"Cannot sell {shares} shares of {symbol}; only {round(owned, 6)} owned"
            )

        remaining = shares
        cost_basis = 0.0
        inferred_currency = currency
        inferred_name = company_name

        for lot in lots:
            if remaining <= 1e-12:
                break
            lot_shares = float(lot["shares"])
            take = min(lot_shares, remaining)
            cost_basis += take * float(lot["price_per_share"])
            if not inferred_currency:
                inferred_currency = lot["currency"]
            if not inferred_name:
                inferred_name = lot["company_name"]

            left = lot_shares - take
            if left <= 1e-12:
                conn.execute("DELETE FROM purchases WHERE id = ?", (lot["id"],))
            else:
                conn.execute(
                    "UPDATE purchases SET shares = ? WHERE id = ?",
                    (round(left, 8), lot["id"]),
                )
            remaining -= take

        proceeds = shares * price_per_share
        realized_gain = proceeds - cost_basis
        created_at = datetime.now(timezone.utc).isoformat()
        cur = conn.execute(
            """
            INSERT INTO sales
                (user_id, symbol, company_name, currency, shares, price_per_share, sold_at,
                 cost_basis, proceeds, realized_gain, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                symbol,
                inferred_name,
                (inferred_currency or "USD").upper(),
                shares,
                price_per_share,
                sold_at,
                round(cost_basis, 2),
                round(proceeds, 2),
                round(realized_gain, 2),
                notes,
                created_at,
            ),
        )
        sale_id = cur.lastrowid

        sale_id = cur.lastrowid

    return get_sale(sale_id, user_id=user_id)


def list_purchases(*, user_id: int, symbol: str | None = None) -> list[dict]:
    with _connect() as conn:
        if symbol:
            rows = conn.execute(
                """
                SELECT * FROM purchases
                WHERE user_id = ? AND symbol = ?
                ORDER BY purchased_at DESC, id DESC
                """,
                (user_id, symbol.upper().strip()),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM purchases
                WHERE user_id = ?
                ORDER BY purchased_at DESC, id DESC
                """,
                (user_id,),
            ).fetchall()
    return [_purchase_to_dict(row) for row in rows]


def list_sales(*, user_id: int, symbol: str | None = None) -> list[dict]:
    with _connect() as conn:
        if symbol:
            rows = conn.execute(
                """
                SELECT * FROM sales
                WHERE user_id = ? AND symbol = ?
                ORDER BY sold_at DESC, id DESC
                """,
                (user_id, symbol.upper().strip()),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM sales
                WHERE user_id = ?
                ORDER BY sold_at DESC, id DESC
                """,
                (user_id,),
            ).fetchall()
    return [_sale_to_dict(row) for row in rows]


def count_purchases(*, user_id: int, symbol: str | None = None) -> int:
    with _connect() as conn:
        if symbol:
            row = conn.execute(
                """
                SELECT COUNT(*) AS n
                FROM purchases
                WHERE user_id = ? AND symbol = ?
                """,
                (user_id, symbol.upper().strip()),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM purchases WHERE user_id = ?",
                (user_id,),
            ).fetchone()
    return int(row["n"] if row else 0)


def list_purchases_page(
    *,
    user_id: int,
    symbol: str | None = None,
    page: int = 1,
    page_size: int | None = 10,
) -> dict:
    if page < 1:
        raise ValueError("page must be >= 1")
    if page_size is not None and page_size < 1:
        raise ValueError("page_size must be >= 1")

    total = count_purchases(user_id=user_id, symbol=symbol)
    if page_size is None:
        items = list_purchases(user_id=user_id, symbol=symbol)
        return {
            "purchases": items,
            "page": 1,
            "page_size": total or 0,
            "total": total,
            "total_pages": 1 if total else 0,
            "has_next": False,
            "has_prev": False,
        }

    total_pages = (total + page_size - 1) // page_size if total else 0
    if total_pages and page > total_pages:
        page = total_pages

    offset = (page - 1) * page_size
    with _connect() as conn:
        if symbol:
            rows = conn.execute(
                """
                SELECT * FROM purchases
                WHERE user_id = ? AND symbol = ?
                ORDER BY purchased_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, symbol.upper().strip(), page_size, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM purchases
                WHERE user_id = ?
                ORDER BY purchased_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, page_size, offset),
            ).fetchall()

    return {
        "purchases": [_purchase_to_dict(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1 and total_pages > 0,
    }


def list_transactions_page(
    *,
    user_id: int,
    page: int = 1,
    page_size: int | None = 10,
) -> dict:
    """Merged buy + sell history, newest first."""
    buys = [
        {
            **p,
            "type": "buy",
            "txn_date": p["purchased_at"],
            "amount": p["cost"],
        }
        for p in list_purchases(user_id=user_id)
    ]
    sells = [
        {
            **s,
            "type": "sell",
            "txn_date": s["sold_at"],
            "amount": s["proceeds"],
        }
        for s in list_sales(user_id=user_id)
    ]
    merged = sorted(
        buys + sells,
        key=lambda t: (t.get("txn_date") or "", t.get("id") or 0),
        reverse=True,
    )
    total = len(merged)

    if page < 1:
        raise ValueError("page must be >= 1")
    if page_size is not None and page_size < 1:
        raise ValueError("page_size must be >= 1")

    if page_size is None:
        return {
            "transactions": merged,
            "page": 1,
            "page_size": total or 0,
            "total": total,
            "total_pages": 1 if total else 0,
            "has_next": False,
            "has_prev": False,
        }

    total_pages = (total + page_size - 1) // page_size if total else 0
    if total_pages and page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "transactions": merged[start:end],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1 and total_pages > 0,
    }


def delete_purchase(purchase_id: int, *, user_id: int) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM purchases WHERE id = ? AND user_id = ?",
            (purchase_id, user_id),
        )
        return cur.rowcount > 0


def _purchase_to_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    shares = float(data["shares"])
    price = float(data["price_per_share"])
    data["shares"] = shares
    data["price_per_share"] = price
    data["cost"] = round(shares * price, 2)
    data["currency"] = (data.get("currency") or "USD").upper()
    return data


def _sale_to_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    shares = float(data["shares"])
    price = float(data["price_per_share"])
    data["shares"] = shares
    data["price_per_share"] = price
    data["cost_basis"] = round(float(data["cost_basis"]), 2)
    data["proceeds"] = round(float(data["proceeds"]), 2)
    data["realized_gain"] = round(float(data["realized_gain"]), 2)
    data["currency"] = (data.get("currency") or "USD").upper()
    return data


def today_iso() -> str:
    return date.today().isoformat()


def get_suggestion_cache() -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT payload, updated_at FROM suggestion_cache WHERE id = 1"
        ).fetchone()
        if not row:
            return None
        return {"payload": row["payload"], "updated_at": row["updated_at"]}


def save_suggestion_cache(payload_json: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO suggestion_cache (id, payload, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
            """,
            (payload_json, now),
        )


def get_dividend_ideas_cache(*, user_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT payload, updated_at FROM dividend_ideas_cache WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return {"payload": row["payload"], "updated_at": row["updated_at"]}


def save_dividend_ideas_cache(*, user_id: int, payload_json: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO dividend_ideas_cache (user_id, payload, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (user_id, payload_json, now),
        )


def clear_dividend_ideas_cache(*, user_id: int) -> None:
    with _connect() as conn:
        conn.execute(
            "DELETE FROM dividend_ideas_cache WHERE user_id = ?",
            (user_id,),
        )


def add_watchlist_item(
    *,
    user_id: int,
    symbol: str,
    requested_symbol: str | None,
    company_name: str | None,
    asset_type: str,
    currency: str,
    added_at: str,
    price_at_add: float,
) -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    sym = symbol.upper().strip()
    with _connect() as conn:
        try:
            cur = conn.execute(
                """
                INSERT INTO watchlist_items (
                    user_id, symbol, requested_symbol, company_name, asset_type,
                    currency, added_at, price_at_add, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    sym,
                    requested_symbol,
                    company_name,
                    asset_type,
                    (currency or "USD").upper().strip(),
                    added_at,
                    price_at_add,
                    created_at,
                ),
            )
            item_id = cur.lastrowid
        except sqlite3.IntegrityError as exc:
            raise ValueError(f"{sym} is already on your watchlist") from exc
    row = get_watchlist_item(item_id, user_id=user_id)
    if not row:
        raise RuntimeError("Failed to load watchlist item after insert")
    return row


def get_watchlist_item(item_id: int, *, user_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM watchlist_items WHERE id = ? AND user_id = ?",
            (item_id, user_id),
        ).fetchone()
    return dict(row) if row else None


def list_watchlist_items(*, user_id: int) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, symbol, requested_symbol, company_name, asset_type,
                   currency, added_at, price_at_add, created_at
            FROM watchlist_items
            WHERE user_id = ?
            ORDER BY added_at DESC, id DESC
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def delete_watchlist_item(item_id: int, *, user_id: int) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM watchlist_items WHERE id = ? AND user_id = ?",
            (item_id, user_id),
        )
    return cur.rowcount > 0


def get_notification_settings(*, user_id: int) -> dict:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT monthly_report_enabled, report_email, last_sent_month
            FROM notification_settings
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return {
            "monthly_report_enabled": False,
            "report_email": "",
            "last_sent_month": None,
        }
    return {
        "monthly_report_enabled": bool(row["monthly_report_enabled"]),
        "report_email": row["report_email"] or "",
        "last_sent_month": row["last_sent_month"],
    }


def upsert_notification_settings(
    *,
    user_id: int,
    monthly_report_enabled: bool,
    report_email: str,
) -> dict:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO notification_settings (
                user_id, monthly_report_enabled, report_email, last_sent_month
            )
            VALUES (?, ?, ?, NULL)
            ON CONFLICT(user_id) DO UPDATE SET
                monthly_report_enabled = excluded.monthly_report_enabled,
                report_email = excluded.report_email
            """,
            (user_id, 1 if monthly_report_enabled else 0, report_email),
        )
    return get_notification_settings(user_id=user_id)


def mark_monthly_report_sent(*, user_id: int, month_key: str) -> None:
    with _connect() as conn:
        conn.execute(
            """
            UPDATE notification_settings
            SET last_sent_month = ?
            WHERE user_id = ?
            """,
            (month_key, user_id),
        )


def list_users_with_monthly_report_enabled() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT user_id, report_email, last_sent_month
            FROM notification_settings
            WHERE monthly_report_enabled = 1
            """
        ).fetchall()
    return [dict(row) for row in rows]
