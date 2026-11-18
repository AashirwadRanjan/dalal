"""One entry point for cron.

    python -m engine.run_daily              # incremental: last ~10 days
    python -m engine.run_daily --backfill   # first run: 10 years of history
    python -m engine.run_daily --only fii_dii
"""
import argparse
import sys
import traceback

from engine import db
from engine.ingest import fii_dii, instruments, market_series, prices
from engine import summary
from engine.signals import live
from engine.signals import run as signals


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="fetch 10 years instead of ~10 days")
    ap.add_argument("--only", choices=["instruments", "prices", "market_series", "fii_dii", "signals", "live", "summary"])
    ap.add_argument("--notify", action="store_true", help="show a macOS notification with the brief when done")
    args = ap.parse_args()
    period = "10y" if args.backfill else "10d"

    conn = db.connect()
    steps = {
        "instruments": lambda: instruments.run(conn),
        "prices": lambda: prices.run(conn, period),
        "market_series": lambda: market_series.run(conn, period),
        "fii_dii": lambda: fii_dii.run(conn),
        "signals": lambda: signals.run(conn),  # after prices: reads prices_daily
        "live": lambda: live.run(conn),        # after signals: logs today's setups, follows earlier ones
        "summary": lambda: summary.run(conn),  # last: reads everything above
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
    if args.notify:
        notify(conn, failed)
        from engine.alerts import notify_telegram
        failed_steps = [r[0] for r in conn.execute(
            "SELECT step FROM ingest_log l WHERE id = (SELECT MAX(id) FROM ingest_log WHERE step = l.step) AND status = 'failed'")]
        print(f"[alerts] {notify_telegram(conn, failed_steps)}")
    return 1 if failed else 0


def notify(conn, failed: int) -> None:
    """macOS notification: first two brief headlines, or which steps failed."""
    import json
    import subprocess

    row = conn.execute("SELECT date, data FROM daily_brief ORDER BY date DESC LIMIT 1").fetchone()
    lines = [h["text"] for h in json.loads(row[1])["headlines"][:2]] if row else []
    title = f"Dalal brief {row[0]}" if row else "Dalal"
    body = " ".join(lines) or "Run finished."
    if failed:
        body = f"{failed} step(s) failed. " + body
    q = lambda s: s.replace("\\", "\\\\").replace('"', '\\"')
    subprocess.run(["osascript", "-e", f'display notification "{q(body)}" with title "{q(title)}"'], check=False)


if __name__ == "__main__":
    sys.exit(main())
