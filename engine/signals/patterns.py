"""Pattern detectors over one stock's daily bars.

Rules every detector follows:
- Uses only bars up to and including the signal bar (no lookahead), so the backtest is honest.
  Swing highs/lows count only once confirmed, PIVOT_N bars after the fact.
- Long only: cash-market delivery in India can't be shorted overnight.
- `entry` is the signal bar's close (a reference). The backtest enters at the next bar's open.
"""
from dataclasses import dataclass

import numpy as np
import pandas as pd

LOOKBACK = 20            # breakout channel and volume average, in bars
ATR_N = 14
VOL_MULT_BREAKOUT = 1.5  # breakout needs volume >= 1.5x its 20-day average
VOL_MULT_SPIKE = 3.0
PIVOT_N = 5              # a swing low/high needs PIVOT_N lower/higher bars on each side
SUPPORT_WINDOW = 120     # look back this far for support/resistance pivots
REWARD_R = 2.0           # default target = entry + 2 x risk
MIN_RR = 1.5             # support bounce: skip if resistance is closer than 1.5 x risk
MIN_HISTORY = 60

PATTERNS = ("breakout", "volume_spike", "support_bounce")


@dataclass
class Signal:
    i: int          # bar index in the frame passed to detect()
    date: str
    pattern: str
    entry: float
    stop: float
    target: float
    detail: str


def _pivots(x: np.ndarray, kind: str) -> np.ndarray:
    """Indices i where x[i] is the min (or max) of x[i-N .. i+N]."""
    s = pd.Series(x)
    w = s.rolling(2 * PIVOT_N + 1, center=True)
    ext = w.min() if kind == "low" else w.max()
    return np.flatnonzero((s == ext).to_numpy())


def detect(df: pd.DataFrame) -> list[Signal]:
    """df: columns open, high, low, close, volume; index = 'YYYY-MM-DD' strings, ascending."""
    n = len(df)
    if n < MIN_HISTORY:
        return []

    o, h, l, c = (df[k].to_numpy(float) for k in ("open", "high", "low", "close"))
    v = df["volume"].to_numpy(float)
    dates = df.index.to_list()

    prev_c = np.r_[np.nan, c[:-1]]
    tr = np.nanmax(np.vstack([h - l, np.abs(h - prev_c), np.abs(l - prev_c)]), axis=0)
    atr = pd.Series(tr).rolling(ATR_N).mean().to_numpy()
    hh = pd.Series(h).shift(1).rolling(LOOKBACK).max().to_numpy()       # prior 20-bar high
    avg_v = pd.Series(v).shift(1).rolling(LOOKBACK).mean().to_numpy()
    volx = np.divide(v, avg_v, out=np.full(n, np.nan), where=avg_v > 0)

    piv_lo, piv_hi = _pivots(l, "low"), _pivots(h, "high")

    out: list[Signal] = []

    def add(t, pattern, stop, target, detail):
        out.append(Signal(t, dates[t], pattern, round(c[t], 2), round(stop, 2), round(target, 2), detail))

    for t in range(MIN_HISTORY, n):
        a = atr[t]
        if not np.isfinite(a) or a <= 0:
            continue

        # 1. Breakout: first close above the prior 20-day high, on volume
        if c[t] > hh[t] and c[t - 1] <= hh[t - 1] and volx[t] >= VOL_MULT_BREAKOUT:
            stop = hh[t] - a  # back inside the range = failed breakout
            add(t, "breakout", stop, c[t] + REWARD_R * (c[t] - stop),
                f"Closed above 20-day high {hh[t]:.2f} on {volx[t]:.1f}x volume")

        # 2. Volume spike: heavy buying, closes near the high
        rng = h[t] - l[t]
        if volx[t] >= VOL_MULT_SPIKE and c[t] > o[t] and rng > 0 and (c[t] - l[t]) / rng >= 2 / 3:
            stop = min(l[t], c[t] - a)
            add(t, "volume_spike", stop, c[t] + REWARD_R * (c[t] - stop),
                f"{volx[t]:.1f}x average volume, closed in top third of range")

        # 3. Support bounce: tags a confirmed swing low and closes bullish above it
        lo_idx = piv_lo[(piv_lo >= t - SUPPORT_WINDOW) & (piv_lo <= t - PIVOT_N)]
        supports = l[lo_idx]
        supports = supports[supports < c[t]]
        if supports.size and c[t] > o[t]:
            sup = supports.max()  # nearest support below price
            if l[t] <= sup + 0.5 * a and l[t - 1] > sup + 0.5 * a:  # first touch, not a drift along it
                stop = sup - 0.5 * a
                risk = c[t] - stop
                hi_idx = piv_hi[(piv_hi >= t - SUPPORT_WINDOW) & (piv_hi <= t - PIVOT_N)]
                res = h[hi_idx]
                res = res[res > c[t]]
                target = res.min() if res.size else c[t] + REWARD_R * risk
                if risk > 0 and (target - c[t]) / risk >= MIN_RR:
                    add(t, "support_bounce", stop, target,
                        f"Bounced off support {sup:.2f}"
                        + (f", resistance {target:.2f}" if res.size else ""))
    return out
