"""Weekly and monthly setups: the daily pattern engine run on resampled bars, backtested separately.

Only completed bars are used. A week or month that is still in progress can make a setup appear and then
vanish, so the current period is dropped unless the latest daily bar is its last trading day (a Friday for
weeks, the last weekday of the month for months; exchange holidays may delay a period by one run).
"""
import json

import pandas as pd

from engine.signals import backtest, patterns

TIMEFRAMES = {"W": "weekly", "M": "monthly"}


def resample(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    """Daily OHLCV (index 'YYYY-MM-DD') -> weekly (Monday start) or monthly bars, dated by their first trading day."""
    idx = pd.to_datetime(df.index)
    key = idx.to_period("W-SUN") if tf == "W" else idx.to_period("M")
    g = df.assign(_k=key, _d=df.index).groupby("_k", sort=True)
    out = pd.DataFrame({
        "open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(),
        "close": g["close"].last(), "volume": g["volume"].sum(), "date": g["_d"].first(), "last": g["_d"].last(),
    })
    return out.set_index("date")


def period_complete(last_daily: str, tf: str) -> bool:
    d = pd.Timestamp(last_daily)
    if tf == "W":
        return d.dayofweek == 4  # Friday
    month_end = d + pd.offsets.BMonthEnd(0)
    return d.normalize() == month_end.normalize()


def completed(bars: pd.DataFrame, tf: str, last_daily: str) -> pd.DataFrame:
    if len(bars) and not period_complete(last_daily, tf):
        return bars.iloc[:-1]
    return bars


def run(prices: pd.DataFrame):
    """prices: all daily rows (symbol, date, OHLCV). Returns (status_rows, stats_rows, summary)."""
    status_rows, stats_rows, notes = [], [], []
    last_daily = prices["date"].max()
    for tf, name in TIMEFRAMES.items():
        all_trades, max_bars = [], 0
        for sym, df in prices.groupby("symbol", sort=False):
            bars = completed(resample(df.set_index("date")[["open", "high", "low", "close", "volume"]], tf), tf, last_daily)
            bars = bars.drop(columns="last")
            max_bars = max(max_bars, len(bars))
            if len(bars) < patterns.MIN_HISTORY:
                status_rows.append((sym, tf, "insufficient", None, None, None, None, None, len(bars)))
                continue
            sigs = patterns.detect(bars)
            arr = [bars[k].to_numpy(float) for k in ("open", "high", "low", "close")]
            trades = backtest.run_symbol(sigs, *arr, bars.index.to_list())
            all_trades += trades
            last_bar = bars.index[-1]
            fresh = [s for s in sigs if s.date == last_bar]
            open_t = next((t for t in reversed(trades) if t.outcome == "open"), None)
            if fresh:
                s = fresh[0]
                status_rows.append((sym, tf, "today", s.pattern, s.date, s.entry, s.stop, s.target, len(bars)))
            elif open_t:
                status_rows.append((sym, tf, "open", open_t.pattern, open_t.signal_date, open_t.entry, open_t.stop, open_t.target, len(bars)))
            else:
                status_rows.append((sym, tf, "none", None, None, None, None, None, len(bars)))
        for p in patterns.PATTERNS:
            st = backtest.stats([t for t in all_trades if t.pattern == p])
            st["bars_needed"], st["bars_available"] = patterns.MIN_HISTORY, max_bars
            stats_rows.append((tf, p, json.dumps(st)))
        closed = sum(t.outcome != "open" for t in all_trades)
        notes.append(f"{name}: {closed} closed trades" if max_bars >= patterns.MIN_HISTORY
                     else f"{name}: needs {patterns.MIN_HISTORY} bars, have {max_bars}")
    return status_rows, stats_rows, "; ".join(notes)
