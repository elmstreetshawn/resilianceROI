"""
Persistent lead store (SQLite) - what "isn't engineered enough" was mostly
pointing at: the funnel only ever lived in React state, so a customer who
picked a plan and left had no way back in, and there was nowhere real for a
completed lead to land. This gives each completed lead a durable id, so the
funnel can hand back a resumable link and continue later (site survey,
install visualization) instead of starting over.
"""
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "leads.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    zip_code TEXT NOT NULL,
    utility TEXT,
    monthly_kwh REAL,
    reason TEXT,
    choice TEXT,
    status TEXT NOT NULL DEFAULT 'plan_selected',
    customer_name TEXT,
    phone TEXT,
    email TEXT,
    scheduled_date TEXT,
    scheduled_window TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

# Added after the initial schema - applied defensively so an existing local leads.db
# (this file is gitignored, dev-only) upgrades in place instead of needing a manual drop.
MIGRATIONS = [
    "ALTER TABLE leads ADD COLUMN customer_name TEXT",
    "ALTER TABLE leads ADD COLUMN phone TEXT",
    "ALTER TABLE leads ADD COLUMN email TEXT",
    "ALTER TABLE leads ADD COLUMN scheduled_date TEXT",
    "ALTER TABLE leads ADD COLUMN scheduled_window TEXT",
]


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with _connect() as conn:
        conn.execute(SCHEMA)
        for migration in MIGRATIONS:
            try:
                conn.execute(migration)
            except sqlite3.OperationalError:
                pass  # column already exists


def create_lead(
    zip_code: str,
    utility: str,
    monthly_kwh: float,
    reason: str,
    choice: str,
    customer_name: str = "",
    phone: str = "",
    email: str = "",
) -> str:
    lead_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO leads (id, zip_code, utility, monthly_kwh, reason, choice, status, customer_name, phone, email, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'plan_selected', ?, ?, ?, ?, ?)",
            (lead_id, zip_code, utility, monthly_kwh, reason, choice, customer_name, phone, email, now, now),
        )
    return lead_id


def get_lead(lead_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    return dict(row) if row else None


def update_lead_status(lead_id: str, status: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE leads SET status = ?, updated_at = ? WHERE id = ?", (status, now, lead_id)
        )
    return cur.rowcount > 0


def update_lead_contact(lead_id: str, customer_name: str, phone: str, email: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE leads SET customer_name = ?, phone = ?, email = ?, updated_at = ? WHERE id = ?",
            (customer_name, phone, email, now, lead_id),
        )
    return cur.rowcount > 0


def count_follow_up_requests(date: str, window: str) -> int:
    """How many leads already requested this date+window - lets the follow-up window
    endpoint enforce a per-slot capacity instead of letting a slot fill up unbounded."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM leads WHERE scheduled_date = ? AND scheduled_window = ?", (date, window)
        ).fetchone()
    return row["n"]


def request_follow_up(lead_id: str, date: str, window: str) -> bool:
    """Stores a sales follow-up request against an existing lead. The website does not
    confirm an install; it captures the preferred outreach window so a Base specialist
    can reach out and qualify the home. date is 'YYYY-MM-DD', window is e.g.
    'morning'/'afternoon' - see main.py's FOLLOW_UP_WINDOWS for the allowed set."""
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE leads SET scheduled_date = ?, scheduled_window = ?, status = 'follow_up_requested', updated_at = ? "
            "WHERE id = ?",
            (date, window, now, lead_id),
        )
    return cur.rowcount > 0
