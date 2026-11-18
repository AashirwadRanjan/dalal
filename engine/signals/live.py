"""Live record: every setup logged on the day it fires, then followed forward with the backtest's own rules.

The backtest can be fooled by hindsight; this can't. A setup is logged only when it fires on the latest final
bar, its levels are frozen at that moment, and each later run replays the bars that have arrived since then
through backtest.simulate (next-open entry, stop first, costs and slippage). So the record starts on the day
this was switched on and grows by itself.

Statuses: waiting (next open not here yet), skipped (opened past the stop or target), open, target, stop, time.
Events (setup_events) drive Telegram alerts: new, entered, skipped, working (+1R reached), target, stop, time.
"""
import datetime as dt

import pandas as pd

from engine.signals import backtest, patterns, timeframes

FINAL = {"target", "stop", "time", "skipped"}
WORKING_R = 1.0
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
CLOSE_FINAL = dt.time(15, 45)  # NSE closes 15:30; Yahoo's daily bar is final a little later


def is_final(date: str, now: dt.datetime | None = None) -> bool:
    """A daily bar is final once its day is over in India (fetches during market hours return a partial bar)."""
    now = now or dt.datetime.now(IST)
    today = now.date().isoformat()
    return date < today or (date == today and now.time() >= CLOSE_FINAL)


def _bars(conn, symbol: str, tf: str, until: str) -> pd.DataFrame:
    df = pd.read_sql("SELECT date, open, high, low, close, volume FROM prices_daily WHERE symbol = ? AND date <= ? "
                     "ORDER BY date", conn, params=(symbol, until), index_col="date").dropna(subset=["open", "close"])
    if tf == "W" and len(df):
        df = timeframes.completed(timeframes.resample(df, "W"), "W", df.index[-1]).drop(columns="last")
    return df


def _log_new(conn, day: str) -> int:
    rows = conn.execute(
        "SELECT symbol, 'D', pattern, side, date, entry, stop, target, detail FROM signals WHERE date = ?", (day,)
    ).fetchall()
    # Weekly setups: only on the run that completes the week (a Friday close), so the next week's open is still
    # ahead. A week whose Friday is a holiday is missed rather than logged late.
    if timeframes.period_complete(day, "W"):
        rows += conn.execute(
            "SELECT symbol, 'W', pattern, '', signal_date, entry, stop, target, '' FROM tf_status "
            "WHERE tf = 'W' AND status = 'today'"
        ).fetchall()
    n = 0
    for sym, tf, pat, side, sdate, entry, stop, target, detail in rows:
        side = side or patterns.SIDE[pat]
        cur = conn.execute(
            "INSERT OR IGNORE INTO setup_log (symbol, tf, pattern, side, signal_date, logged_on, ref_entry, stop, target, "
            "detail, status) VALUES (?,?,?,?,?,?,?,?,?,?, 'waiting')",
            (sym, tf, pat, side, sdate, day, entry, stop, target, detail))
        if cur.rowcount:
            conn.execute("INSERT INTO setup_events (log_id, date, event) VALUES (?,?, 'new')", (cur.lastrowid, day))
            n += 1
    return n


def _best_r(t: backtest.Trade, df: pd.DataFrame, entry_i: int, short: bool) -> float:
    seg = df.iloc[entry_i: t.exit_i + 1]
    risk = abs(t.entry - t.stop)
    if risk <= 0 or seg.empty:
        return 0.0
    return float((t.entry - seg["low"].min()) / risk if short else (seg["high"].max() - t.entry) / risk)


def update(conn, day: str) -> dict:
    counts: dict[str, int] = {}
    live = conn.execute("SELECT id, symbol, tf, pattern, side, signal_date, ref_entry, stop, target, status, best_r "
                        "FROM setup_log WHERE status NOT IN ('target', 'stop', 'time', 'skipped')").fetchall()
    for lid, sym, tf, pat, side, sdate, ref, stop, target, status, best in live:
        df = _bars(conn, sym, tf, day)
        if sdate not in df.index:
            continue
        i = df.index.get_loc(sdate)
        sig = patterns.Signal(i=i, date=sdate, pattern=pat, entry=ref, stop=stop, target=target, detail="")
        arr = [df[k].to_numpy(float) for k in ("open", "high", "low", "close")]
        t = backtest.simulate(sig, *arr, df.index.to_list())
        events = []
        if t is None:
            new_status = "waiting" if i + 1 >= len(df) else "skipped"
            if new_status == "skipped":
                events.append(("skipped", df.index[i + 1]))
            conn.execute("UPDATE setup_log SET status = ?, last_date = ?, last_close = ? WHERE id = ?",
                         (new_status, df.index[-1], float(df["close"].iloc[-1]), lid))
        else:
            new_status = "open" if t.outcome == "open" else t.outcome
            b = _best_r(t, df, i + 1, side == "short")
            if status == "waiting":
                events.append(("entered", t.entry_date))
            if (best or 0) < WORKING_R <= b:
                events.append(("working", t.exit_date if new_status != "open" else df.index[-1]))
            if new_status != "open":
                events.append((new_status, t.exit_date))
            last_close = float(df["close"].iloc[-1])
            conn.execute(
                "UPDATE setup_log SET status = ?, entry_date = ?, entry = ?, exit_date = ?, exit = ?, r = ?, best_r = ?, "
                "last_date = ?, last_close = ? WHERE id = ?",
                (new_status, t.entry_date, t.entry, None if new_status == "open" else t.exit_date,
                 None if new_status == "open" else t.exit, None if new_status == "open" else t.r,
                 round(b, 3), df.index[-1], last_close, lid))
        for ev, d in events:
            conn.execute("INSERT OR IGNORE INTO setup_events (log_id, date, event) VALUES (?,?,?)", (lid, d, ev))
            counts[ev] = counts.get(ev, 0) + 1
    return counts


def run(conn, now: dt.datetime | None = None) -> str:
    last = conn.execute("SELECT MAX(date) FROM prices_daily").fetchone()[0]
    if not last:
        return "no prices yet"
    final = is_final(last, now)
    # During market hours the latest bar is partial: follow setups only up to the previous final bar
    day = last if final else conn.execute("SELECT MAX(date) FROM prices_daily WHERE date < ?", (last,)).fetchone()[0]
    with conn:
        logged = _log_new(conn, last) if final else 0
        counts = update(conn, day)
    n_open = conn.execute("SELECT COUNT(*) FROM setup_log WHERE status = 'open'").fetchone()[0]
    moved = ", ".join(f"{v} {k}" for k, v in sorted(counts.items())) or "no changes"
    return (f"{logged} setups logged" + ("" if final else " (market still open: today's bar is not final)")
            + f"; {moved}; {n_open} open")
