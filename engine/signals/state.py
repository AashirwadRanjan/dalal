"""Per-stock trend and momentum state from daily bars.

Shared by the backtest (trend at signal time), the daily brief, the outlook lists and
portfolio suggestions. Every column at bar t uses only bars <= t.
"""
import numpy as np
import pandas as pd

from engine.signals.patterns import PIVOT_N, SUPPORT_WINDOW, _pivots

TRENDS = ("up", "sideways", "down", "unknown")


def indicators(df: pd.DataFrame) -> pd.DataFrame:
    """df: open, high, low, close, volume (ascending). Returns one row per bar."""
    c, h, l, v = df["close"], df["high"], df["low"], df["volume"]
    out = pd.DataFrame(index=df.index)
    out["close"] = c
    out["chg_1d"] = c / c.shift(1) - 1
    out["dma50"] = c.rolling(50).mean()
    out["dma200"] = c.rolling(200).mean()
    slope = out["dma50"] - out["dma50"].shift(10)

    prev = c.shift(1)
    tr = pd.concat([h - l, (h - prev).abs(), (l - prev).abs()], axis=1).max(axis=1)
    out["atr"] = tr.rolling(22).mean()
    # Chandelier trailing stop: highest high of the last 22 bars minus 3 ATR
    out["trail_stop"] = h.rolling(22).max() - 3 * out["atr"]
    # Short-side mirror: lowest low of the last 22 bars plus 3 ATR (used by the short backtest)
    out["trail_stop_short"] = l.rolling(22).min() + 3 * out["atr"]

    up = (c > out["dma50"]) & (out["dma50"] > out["dma200"]) & (slope > 0)
    down = (c < out["dma50"]) & (out["dma50"] < out["dma200"]) & (slope < 0)
    out["trend"] = np.where(out["dma200"].isna(), "unknown", np.where(up, "up", np.where(down, "down", "sideways")))

    for name, n in (("ret_1m", 21), ("ret_3m", 63), ("ret_6m", 126)):
        out[name] = c / c.shift(n) - 1
    out["hi52"] = h.rolling(252, min_periods=120).max()
    out["lo52"] = l.rolling(252, min_periods=120).min()

    avg_v = v.shift(1).rolling(20).mean()
    out["volx"] = v / avg_v.where(avg_v > 0)
    # Breakdown: first close below the prior 20-day low, on volume
    low20 = l.shift(1).rolling(20).min()
    out["low20"] = low20
    out["breakdown"] = (c < low20) & (c.shift(1) >= low20.shift(1)) & (out["volx"] >= 1.5)

    # What the next bar needs to fire a breakout/breakdown (patterns.py rules 1 and 4): close beyond the 20-day
    # high/low including today, on 1.5x the 20-day average volume including today
    out["bo_level"] = h.rolling(20).max()
    out["bd_level"] = l.rolling(20).min()
    out["vol_needed"] = 1.5 * v.rolling(20).mean()

    # RSI(14), Wilder smoothing
    delta = c.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    rs = gain / loss
    out["rsi14"] = np.where(loss == 0, 100.0, 100 - 100 / (1 + rs))
    out.loc[gain.isna(), "rsi14"] = np.nan

    # MACD(12, 26, 9)
    ema12 = c.ewm(span=12, adjust=False, min_periods=12).mean()
    ema26 = c.ewm(span=26, adjust=False, min_periods=26).mean()
    out["macd"] = ema12 - ema26
    out["macd_signal"] = out["macd"].ewm(span=9, adjust=False, min_periods=9).mean()
    out["macd_hist"] = out["macd"] - out["macd_signal"]

    # Bollinger bands (20, 2 standard deviations)
    mid = c.rolling(20).mean()
    sd = c.rolling(20).std(ddof=0)
    out["bb_mid"], out["bb_up"], out["bb_low"] = mid, mid + 2 * sd, mid - 2 * sd
    return out


def levels(df: pd.DataFrame) -> tuple[float | None, float | None]:
    """Nearest confirmed swing support below and resistance above the last close.

    Swing lows/highs are confirmed PIVOT_N bars after the fact (same rule as the pattern engine)
    and looked up within the last SUPPORT_WINDOW bars.
    """
    n = len(df)
    if n < 2 * PIVOT_N + 1:
        return None, None
    lo, hi, c = df["low"].to_numpy(float), df["high"].to_numpy(float), float(df["close"].iloc[-1])
    t = n - 1
    lo_i = _pivots(lo, "low")
    hi_i = _pivots(hi, "high")
    lo_i = lo_i[(lo_i >= t - SUPPORT_WINDOW) & (lo_i <= t - PIVOT_N)]
    hi_i = hi_i[(hi_i >= t - SUPPORT_WINDOW) & (hi_i <= t - PIVOT_N)]
    sup = lo[lo_i][lo[lo_i] < c]
    res = hi[hi_i][hi[hi_i] > c]
    return (float(sup.max()) if sup.size else None, float(res.min()) if res.size else None)
