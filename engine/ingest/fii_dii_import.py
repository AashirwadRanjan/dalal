"""Import FII/DII history from a CSV you saved yourself (no scraping).

    python -m engine.ingest.fii_dii_import data/fii_dii_history.csv

Columns (header row required, order free): date, fii_net, dii_net, and optionally fii_buy, fii_sell,
dii_buy, dii_sell. Values in Rs crore; commas allowed. Dates as YYYY-MM-DD, DD-MM-YYYY or DD-Mon-YYYY.
Existing rows (for example from the daily NSE fetch) are never overwritten.
See engine/ingest/fii_dii_history.example.csv.
"""
import csv
import sys
from datetime import datetime

from engine import db

COLS = ["fii_buy", "fii_sell", "fii_net", "dii_buy", "dii_sell", "dii_net"]


def parse_date(s: str) -> str:
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d-%b-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"unrecognised date {s!r}")


def num(s):
    s = (s or "").replace(",", "").strip()
    return float(s) if s else None


def load(path: str) -> tuple[list[tuple], list[str]]:
    rows, errors = [], []
    with open(path, newline="", encoding="utf-8-sig") as f:
        r = csv.DictReader(f)
        head = {h.strip().lower(): h for h in (r.fieldnames or [])}
        if not {"date", "fii_net", "dii_net"} <= head.keys():
            raise ValueError("CSV needs at least the columns date, fii_net, dii_net")
        for i, line in enumerate(r, start=2):
            try:
                rows.append((parse_date(line[head["date"]]), *(num(line[head[c]]) if c in head else None for c in COLS)))
            except ValueError as e:
                errors.append(f"line {i}: {e}")
    return rows, errors


def run(conn, path: str) -> str:
    rows, errors = load(path)
    before = conn.execute("SELECT COUNT(*) FROM fii_dii_daily").fetchone()[0]
    with conn:
        conn.executemany(f"INSERT OR IGNORE INTO fii_dii_daily (date, {', '.join(COLS)}) VALUES (?,?,?,?,?,?,?)", rows)
    added = conn.execute("SELECT COUNT(*) FROM fii_dii_daily").fetchone()[0] - before
    return f"{added} days added, {len(rows) - added} already present" + (f"; skipped {len(errors)}: {'; '.join(errors[:3])}" if errors else "")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(run(db.connect(), sys.argv[1]))
