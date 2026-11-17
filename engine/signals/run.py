"""Recompute signals, backtest trades, per-pattern stats and the per-stock state snapshot.

Rebuilt from scratch each run (a few seconds), so tweaking a detector and re-running
gives a clean, consistent backtest.
"""
import json
import math

import pandas as pd

from engine.signals import backtest, patterns, state

STATE_COLS = ["date", "close", "chg_1d", "dma50", "dma200", "trend", "ret_1m", "ret_3m", "ret_6m",
              "rs_pct", "atr", "trail_stop", "hi52", "lo52", "volx", "low20", "breakdown"]


def _clean(x):
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if hasattr(x, "item"):  # numpy scalar
        return _clean(x.item())
    return x


def run(conn) -> str:
    prices = pd.read_sql(
        "SELECT symbol, date, open, high, low, close, volume FROM prices_daily ORDER BY symbol, date",
        conn,
    ).dropna(subset=["open", "high", "low", "close"])
    prices["volume"] = prices["volume"].fillna(0)

    sig_rows, trade_rows, all_trades, latest = [], [], [], []
    for sym, df in prices.groupby("symbol", sort=False):
        df = df.set_index("date")
        ind = state.indicators(df)
        last = ind.iloc[-1].copy()
        last["date"], last["symbol"] = ind.index[-1], sym
        latest.append(last)

        sigs = patterns.detect(df)
        if not sigs:
            continue
        trend_at = ind["trend"].to_numpy()
        sig_rows += [(sym, s.date, s.pattern, trend_at[s.i], s.entry, s.stop, s.target, s.detail) for s in sigs]
        arr = [df[k].to_numpy(float) for k in ("open", "high", "low", "close")]
        trades = backtest.run_symbol(sigs, *arr, df.index.to_list())
        sig_i = {s.date: s.i for s in sigs}
        for t in trades:
            t.trend = trend_at[sig_i[t.signal_date]]
        all_trades += trades
        trade_rows += [
            (sym, t.pattern, t.signal_date, t.trend, t.entry_date, t.entry, t.stop, t.target,
             t.exit_date, t.exit, t.outcome, t.r, t.ret_pct, t.bars)
            for t in trades
        ]

    stat_rows = []
    for p in patterns.PATTERNS:
        mine = [t for t in all_trades if t.pattern == p]
        st = backtest.stats(mine)
        st["by_trend"] = {tr: backtest.stats([t for t in mine if t.trend == tr]) for tr in state.TRENDS}
        st["params"] = {"max_hold": backtest.MAX_HOLD, "cost_pct": backtest.COST_PCT, "reward_r": patterns.REWARD_R}
        stat_rows.append((p, json.dumps(st)))

    snap = pd.DataFrame(latest)
    snap["rs_pct"] = snap["ret_6m"].rank(pct=True) * 100
    snap["breakdown"] = snap["breakdown"].astype(bool).astype(int)
    state_rows = [(r["symbol"], *(_clean(r[c]) for c in STATE_COLS)) for _, r in snap.iterrows()]

    with conn:  # one transaction: the dashboard never sees a half-rebuilt state
        for t in ("signals", "trades", "pattern_stats", "stock_state"):
            conn.execute(f"DELETE FROM {t}")
        conn.executemany("INSERT INTO signals (symbol, date, pattern, trend, entry, stop, target, detail) "
                         "VALUES (?,?,?,?,?,?,?,?)", sig_rows)
        conn.executemany(
            "INSERT INTO trades (symbol, pattern, signal_date, trend, entry_date, entry, stop, target, "
            "exit_date, exit, outcome, r, ret_pct, bars) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            trade_rows,
        )
        conn.executemany("INSERT INTO pattern_stats (pattern, stats) VALUES (?,?)", stat_rows)
        conn.executemany(
            f"INSERT INTO stock_state (symbol, {', '.join(STATE_COLS)}) VALUES ({', '.join('?' * (len(STATE_COLS) + 1))})",
            state_rows,
        )

    closed = sum(t.outcome != "open" for t in all_trades)
    return f"{len(sig_rows)} signals, {closed} closed backtest trades, {len(state_rows)} stock states"
