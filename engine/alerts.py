"""Telegram alert after the daily run (official Bot API; no scraping).

Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env at the repo root (see .env.example). Without them nothing
is sent and the macOS notification remains the only alert.

Besides the brief, the message carries live-record events (engine/signals/live.py) that haven't been sent yet:
every event on a stock you hold or watch, and weekly breakouts and volume spikes (the two rules that passed
weekly training). An event is marked sent only after Telegram accepts the message.
"""
import json
import os
import urllib.request
from pathlib import Path

from engine.db import ROOT, portfolio_symbols

ALERT_WEEKLY = {"breakout", "volume_spike"}
EVENT_DAYS = 10    # older unsent events are dropped, not sent late
MAX_EVENTS = 25
LABEL = {"breakout": "breakout", "volume_spike": "volume spike", "support_bounce": "support bounce",
         "breakdown": "breakdown", "selling_spike": "selling spike", "resistance_reject": "resistance rejection"}


def load_env(path: Path = ROOT / ".env") -> None:
    """Minimal .env reader: KEY=VALUE lines, # comments; never overrides variables already set."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def message(conn, failed_steps: list[str]) -> str:
    row = conn.execute("SELECT date, data FROM daily_brief ORDER BY date DESC LIMIT 1").fetchone()
    parts = []
    if failed_steps:
        parts.append("⚠️ Failed: " + ", ".join(failed_steps) + ". Check the Data health page.")
    if row:
        d = json.loads(row[1])
        parts.append(f"Dalal brief, {row[0]}")
        if d.get("hero"):
            parts.append(d["hero"]["headline"])
        tag = {"up": "▲", "down": "▼", "flat": "•"}
        parts += [f"{tag.get(l['tone'], '•')} {l['text']}" for l in d.get("lines") or d.get("headlines", [])[:5]]
    ev_lines, _ = event_lines(conn)
    if ev_lines:
        parts += ["", "Setups you follow:"] + ev_lines
    rec = record_line(conn)
    if rec:
        parts += ["", rec]
    parts.append("End-of-day data. Personal research tool, not investment advice.")
    return "\n".join(parts)


def _fmt(x):
    return f"{x:,.2f}" if x is not None else "?"


def pending_events(conn, mine: set[str] | None = None) -> list[dict]:
    """Unsent events in alert scope, oldest first."""
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'setup_events'").fetchone():
        return []
    mine = portfolio_symbols() if mine is None else mine
    rows = conn.execute(
        "SELECT e.rowid, e.event, e.date, l.symbol, l.tf, l.pattern, l.side, l.ref_entry, l.stop, l.target, l.entry, "
        "l.r, l.exit FROM setup_events e JOIN setup_log l ON l.id = e.log_id "
        "WHERE e.sent = 0 AND e.date >= date((SELECT MAX(date) FROM prices_daily), ?) ORDER BY e.date, l.symbol",
        (f"-{EVENT_DAYS} days",)).fetchall()
    keys = ["rowid", "event", "date", "symbol", "tf", "pattern", "side", "ref", "stop", "target", "entry", "r", "exit"]
    out = [dict(zip(keys, r)) for r in rows]
    return [e for e in out if e["symbol"] in mine or (e["tf"] == "W" and e["pattern"] in ALERT_WEEKLY)]


def describe(e: dict) -> str:
    what = f"{e['side']} {LABEL.get(e['pattern'], e['pattern'])}, {'weekly' if e['tf'] == 'W' else 'daily'}"
    s, ev = e["symbol"], e["event"]
    if ev == "new":
        return (f"🆕 {s}: {what} setup. Enters at the next open (ref {_fmt(e['ref'])}), "
                f"stop {_fmt(e['stop'])}, target {_fmt(e['target'])}")
    if ev == "entered":
        return f"▶️ {s}: {what} entered at {_fmt(e['entry'])} ({e['date']})"
    if ev == "skipped":
        return f"⏭️ {s}: {what} skipped, it opened past its stop or target"
    if ev == "working":
        return f"📈 {s}: {what} is working, it reached +1R"
    if ev == "target":
        return f"✅ {s}: {what} hit its target, {e['r']:+.2f}R"
    if ev == "stop":
        return f"❌ {s}: {what} stopped out, {e['r']:+.2f}R"
    if ev == "time":
        return f"⏱️ {s}: {what} closed at the time limit, {e['r']:+.2f}R"
    return f"{s}: {ev}"


def event_lines(conn, mine: set[str] | None = None) -> tuple[list[str], list[int]]:
    ev = pending_events(conn, mine)
    lines = [describe(e) for e in ev[:MAX_EVENTS]]
    if len(ev) > MAX_EVENTS:
        lines.append(f"…and {len(ev) - MAX_EVENTS} more on the Live record page")
    return lines, [e["rowid"] for e in ev]


def record_line(conn) -> str | None:
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'setup_log'").fetchone():
        return None
    start, n_closed, avg, n_open = conn.execute(
        "SELECT MIN(logged_on), SUM(r IS NOT NULL), AVG(r), SUM(status = 'open') FROM setup_log").fetchone()
    if not start:
        return None
    closed = f"{n_closed} closed, average {avg:+.2f}R" if n_closed else "none closed yet"
    return f"Live record since {start}: {closed}; {n_open or 0} open."


def send_telegram(text: str, token: str, chat_id: str, opener=urllib.request.urlopen) -> bool:
    if len(text) > 4000:  # Telegram's limit is 4096 characters
        text = text[:3990] + "\n…"
    body = json.dumps({"chat_id": chat_id, "text": text, "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with opener(req, timeout=15) as r:
        return json.loads(r.read()).get("ok", False)


def notify_telegram(conn, failed_steps: list[str]) -> str:
    load_env()
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return "telegram not configured"
    try:
        _, ids = event_lines(conn)
        if not send_telegram(message(conn, failed_steps), token, chat):
            return "telegram refused the message"
        with conn:
            conn.executemany("UPDATE setup_events SET sent = 1 WHERE rowid = ?", [(i,) for i in ids])
        return f"telegram sent ({len(ids)} setup events)"
    except Exception as e:  # network or bad token: the run itself must still succeed
        return f"telegram failed: {type(e).__name__}"
