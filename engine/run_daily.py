"""One entry point for cron.

    python -m engine.run_daily              # incremental: last ~10 days
    python -m engine.run_daily --backfill   # first run: 2 years of history
    python -m engine.run_daily --only fii_dii
"""
import argparse
import sys
import traceback

from engine import db
from engine.ingest import fii_dii, instruments, market_series, prices


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="fetch 2 years instead of ~10 days")
    ap.add_argument("--only", choices=["instruments", "prices", "market_series", "fii_dii"])
    args = ap.parse_args()
    period = "2y" if args.backfill else "10d"

    conn = db.connect()
    steps = {
        "instruments": lambda: instruments.run(conn),
        "prices": lambda: prices.run(conn, period),
        "market_series": lambda: market_series.run(conn, period),
        "fii_dii": lambda: fii_dii.run(conn),
    }
    if args.only:
        steps = {args.only: steps[args.only]}

    failed = 0
    for name, fn in steps.items():
        print(f"[{name}] ...", flush=True)
        try:
            detail = fn()
            conn.execute("INSERT INTO ingest_log (step, status, detail) VALUES (?, 'ok', ?)", (name, detail))
            print(f"[{name}] ok: {detail}")
        except Exception as e:
            failed += 1
            conn.execute("INSERT INTO ingest_log (step, status, detail) VALUES (?, 'failed', ?)", (name, str(e)))
            print(f"[{name}] FAILED: {e}", file=sys.stderr)
            traceback.print_exc()
        conn.commit()  # one failing step must not stop the others
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
