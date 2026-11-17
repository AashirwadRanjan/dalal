"""Telegram alert after the daily run (official Bot API; no scraping).

Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env at the repo root (see .env.example). Without them nothing
is sent and the macOS notification remains the only alert.
"""
import json
import os
import urllib.request
from pathlib import Path

from engine.db import ROOT


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
    parts.append("End-of-day data. Personal research tool, not investment advice.")
    return "\n".join(parts)


def send_telegram(text: str, token: str, chat_id: str, opener=urllib.request.urlopen) -> bool:
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
        return "telegram sent" if send_telegram(message(conn, failed_steps), token, chat) else "telegram refused the message"
    except Exception as e:  # network or bad token: the run itself must still succeed
        return f"telegram failed: {type(e).__name__}"
