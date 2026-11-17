"""Recompute signals, backtest trades, per-pattern stats and the per-stock state snapshot.

Rebuilt from scratch each run (a few seconds), so tweaking a detector and re-running
gives a clean, consistent backtest.
"""
import json
import math

import numpy as np
import pandas as pd

from engine.signals import backtest, patterns, state, timeframes

MIN_TURNOVER = 5e7  # Rs 5 crore average daily traded value; thinner stocks are skipped
VARIANTS = ["base", "regime", "trail", "regime_trail"]  # base must stay first

STATE_COLS = ["date", "close", "chg_1d", "dma50", "dma200", "trend", "ret_1m", "ret_3m", "ret_6m",
              "rs_pct", "atr", "trail_stop", "hi52", "lo52", "volx", "low20", "breakdown",
              "rsi14", "macd", "macd_signal", "macd_hist", "bb_up", "bb_mid", "bb_low", "support", "resistance"]


def _clean(x):
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if hasattr(x, "item"):  # numpy scalar
        return _clean(x.item())
    return x


def market_regime(conn) -> dict[str, bool]:
    """Date -> True when the Nifty 50 closed above its 200-day average that day (known at the close)."""
    n = pd.read_sql("SELECT date, close FROM market_series WHERE symbol = '^NSEI' ORDER BY date", conn).set_index("date")["close"]
    sma = n.rolling(200).mean()
    return {d: bool(c > m) for d, c, m in zip(n.index, n, sma) if np.isfinite(m)}


def benchmark(prices: pd.DataFrame) -> list[tuple]:
    """Equal-weight buy-and-hold of today's universe: each day, the average one-day return across stocks
    that traded both days, compounded from 100. Survivorship: only stocks in today's list are included."""
    close = prices.pivot(index="date", columns="symbol", values="close").sort_index()
    ret = close.pct_change(fill_method=None)
    daily = ret.mean(axis=1, skipna=True).fillna(0.0)
    n = ret.notna().sum(axis=1)
    index = 100 * (1 + daily).cumprod()
    return [(d, float(r), float(i), int(k)) for d, r, i, k in zip(daily.index, daily, index, n)]


def run(conn) -> str:
    prices = pd.read_sql(
        "SELECT symbol, date, open, high, low, close, volume FROM prices_daily ORDER BY symbol, date",
        conn,
    ).dropna(subset=["open", "high", "low", "close"])
    prices["volume"] = prices["volume"].fillna(0)

    regime_up = market_regime(conn)
    sig_rows, trade_rows, latest, illiquid = [], [], [], 0
    variant_trades: dict[str, list] = {v: [] for v in VARIANTS}
    for sym, df in prices.groupby("symbol", sort=False):
        df = df.set_index("date")
        ind = state.indicators(df)
        last = ind.iloc[-1].copy()
        last["date"], last["symbol"] = ind.index[-1], sym
        last["support"], last["resistance"] = state.levels(df)
        latest.append(last)

        raw = patterns.detect(df)
        # Liquidity: average daily traded value over the 20 days before the signal (no lookahead)
        turnover = (df["close"] * df["volume"]).shift(1).rolling(20).mean().to_numpy()
        sigs = [s for s in raw if np.isfinite(turnover[s.i]) and turnover[s.i] >= MIN_TURNOVER]
        illiquid += len(raw) - len(sigs)
        if not sigs:
            continue
        trend_at = ind["trend"].to_numpy()
        sig_rows += [(sym, s.date, s.pattern, trend_at[s.i], s.entry, s.stop, s.target, s.detail) for s in sigs]
        arr = [df[k].to_numpy(float) for k in ("open", "high", "low", "close")]
        dates = df.index.to_list()
        trail = ind["trail_stop"].to_numpy()
        up_sigs = [s for s in sigs if regime_up.get(s.date, False)]
        runs = {
            "base": backtest.run_symbol(sigs, *arr, dates),
            "regime": backtest.run_symbol(up_sigs, *arr, dates),
            "trail": backtest.run_symbol(sigs, *arr, dates, mode="trail", trail=trail),
            "regime_trail": backtest.run_symbol(up_sigs, *arr, dates, mode="trail", trail=trail),
        }
        sig_i = {s.date: s.i for s in sigs}
        for v, trades in runs.items():
            for t in trades:
                t.trend = trend_at[sig_i[t.signal_date]]
            variant_trades[v] += trades
        trade_rows += [
            (sym, t.pattern, t.signal_date, t.trend, t.entry_date, t.entry, t.stop, t.target,
             t.exit_date, t.exit, t.outcome, t.r, t.ret_pct, t.bars)
            for t in runs["base"]
        ]

    all_trades = variant_trades["base"]
    stat_rows = []
    for p in patterns.PATTERNS:
        mine = [t for t in all_trades if t.pattern == p]
        st = backtest.stats(mine)
        st["by_trend"] = {tr: backtest.stats([t for t in mine if t.trend == tr]) for tr in state.TRENDS}
        st["params"] = {"max_hold": backtest.MAX_HOLD, "cost_pct": backtest.COST_PCT, "reward_r": patterns.REWARD_R,
                        "slippage_pct": backtest.SLIPPAGE_PCT, "min_turnover_cr": MIN_TURNOVER / 1e7,
                        "trail_max_hold": backtest.TRAIL_MAX_HOLD}
        st["walk_forward"] = backtest.walk_forward(mine)
        st["by_year"] = backtest.by_year(mine)
        st["variants"] = {}
        for v in VARIANTS[1:]:
            vt = [t for t in variant_trades[v] if t.pattern == p]
            st["variants"][v] = {**backtest.stats(vt), "walk_forward": backtest.walk_forward(vt), "by_year": backtest.by_year(vt)}
        stat_rows.append((p, json.dumps(st)))

    snap = pd.DataFrame(latest)
    snap["rs_pct"] = snap["ret_6m"].rank(pct=True) * 100
    snap["breakdown"] = snap["breakdown"].astype(bool).astype(int)
    state_rows = [(r["symbol"], *(_clean(r[c]) for c in STATE_COLS)) for _, r in snap.iterrows()]

    tf_status, tf_stats, tf_note = timeframes.run(prices)
    bench = benchmark(prices)

    with conn:  # one transaction: the dashboard never sees a half-rebuilt state
        for t in ("signals", "trades", "pattern_stats", "stock_state", "tf_status", "tf_stats", "benchmark_daily"):
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
        conn.executemany("INSERT INTO tf_status VALUES (?,?,?,?,?,?,?,?,?)", tf_status)
        conn.executemany("INSERT INTO tf_stats VALUES (?,?,?)", tf_stats)
        conn.executemany("INSERT INTO benchmark_daily VALUES (?,?,?,?)", bench)

    closed = sum(t.outcome != "open" for t in all_trades)
    return (f"{len(sig_rows)} setups ({illiquid} skipped as illiquid), {closed} closed backtest trades, "
            f"{len(state_rows)} stock states; {tf_note}")
