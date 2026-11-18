"""Classic chart patterns and candlesticks, as context next to setups ("also visible: double bottom").

These are not trade rules. Each is defined by fixed geometry on confirmed swing points and "fires" on the bar
that completes it (the close through the neckline or the candle itself), using no later bars. The engine then
measures what happened over the next HORIZON bars across 10 years, against the average stock over the same
horizon, so the page can say whether a pattern has meant anything.

Swing points come from patterns._pivots and count only PIVOT_N bars after the fact, like the setup detectors.
"""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from engine.signals.patterns import PIVOT_N, _pivots

HORIZON = 10        # bars ahead used to judge a pattern
MAX_WAIT = 30       # a neckline break must come within this many bars of the last swing point
MIN_GAP, MAX_GAP = 10, 60   # bars between the two tops/bottoms
SAME_PCT = 3.0      # double top/bottom: the two extremes within 3%
FLAT_PCT = 1.5      # triangle: the flat side within 1.5%
DEPTH_PCT = 5.0     # double top/bottom: neckline at least 5% away from the extremes
HEAD_PCT = 3.0      # head and shoulders: head at least 3% beyond both shoulders
SHOULDER_PCT = 5.0  # ...and the shoulders within 5% of each other
RECENT = 5          # a pattern counts as "visible now" if it fired within the last 5 bars

BIAS = {
    "double_bottom": "bullish", "double_top": "bearish",
    "inverse_head_shoulders": "bullish", "head_shoulders": "bearish",
    "ascending_triangle": "bullish", "descending_triangle": "bearish",
    "bullish_engulfing": "bullish", "bearish_engulfing": "bearish",
    "hammer": "bullish", "shooting_star": "bearish",
}
NAMES = tuple(BIAS)


@dataclass
class Event:
    i: int
    date: str
    name: str
    detail: str

    @property
    def bias(self) -> str:
        return BIAS[self.name]


def _pct(a, b):
    return abs(a - b) / min(abs(a), abs(b)) * 100


def _break(c, start, end, level, up: bool, guard=None):
    """First bar in [start, end] closing through `level` (above if up), with no earlier close beyond `guard`
    on the other side (which would have cancelled the pattern). Returns the index or None."""
    for t in range(max(start, 1), min(end, len(c) - 1) + 1):
        if guard is not None and (c[t] < guard if up else c[t] > guard):
            return None
        if (c[t] > level and c[t - 1] <= level) if up else (c[t] < level and c[t - 1] >= level):
            return t
        if (c[t - 1] > level) if up else (c[t - 1] < level):
            return None  # already through before the pattern finished
    return None


def detect(df: pd.DataFrame) -> list[Event]:
    o, h, l, c = (df[k].to_numpy(float) for k in ("open", "high", "low", "close"))
    dates = df.index.to_list()
    n = len(c)
    if n < 60:
        return []
    lo, hi = _pivots(l, "low"), _pivots(h, "high")
    out: list[Event] = []

    def add(t, name, detail):
        out.append(Event(t, dates[t], name, detail))

    # Double bottom / double top: two similar extremes, a neckline between them, then a close through it
    for piv, up, name in ((lo, True, "double_bottom"), (hi, False, "double_top")):
        x = l if up else h
        for a, b in zip(piv[:-1], piv[1:]):
            if not (MIN_GAP <= b - a <= MAX_GAP) or _pct(x[a], x[b]) > SAME_PCT:
                continue
            neck = h[a:b + 1].max() if up else l[a:b + 1].min()
            ext = min(x[a], x[b]) if up else max(x[a], x[b])
            if _pct(neck, ext) < DEPTH_PCT:
                continue
            t = _break(c, b + PIVOT_N, b + MAX_WAIT, neck, up, guard=ext)
            if t is not None:
                add(t, name, f"{'Bottoms' if up else 'Tops'} near {x[a]:.2f} and {x[b]:.2f}, closed "
                              f"{'above' if up else 'below'} the {neck:.2f} neckline")

    # Head and shoulders (tops) and inverse (bottoms): three swing points, the middle one furthest out
    for piv, up, name in ((lo, True, "inverse_head_shoulders"), (hi, False, "head_shoulders")):
        x = l if up else h
        for a, b, d in zip(piv[:-2], piv[1:-1], piv[2:]):
            if d - a > 2 * MAX_GAP:
                continue
            beyond = (lambda p, q: q > p * (1 + HEAD_PCT / 100)) if up else (lambda p, q: p > q * (1 + HEAD_PCT / 100))
            if not (beyond(x[b], x[a]) and beyond(x[b], x[d])) or _pct(x[a], x[d]) > SHOULDER_PCT:
                continue
            t1 = h[a:b + 1].max() if up else l[a:b + 1].min()
            t2 = h[b:d + 1].max() if up else l[b:d + 1].min()
            neck = (t1 + t2) / 2
            t = _break(c, d + PIVOT_N, d + MAX_WAIT, neck, up, guard=x[b])
            if t is not None:
                add(t, name, f"Head at {x[b]:.2f}, shoulders near {x[a]:.2f} and {x[d]:.2f}, closed "
                              f"{'above' if up else 'below'} the {neck:.2f} neckline")

    # Ascending triangle (flat top, rising lows) and descending triangle (flat bottom, falling highs)
    for flat, other, up, name in ((hi, lo, True, "ascending_triangle"), (lo, hi, False, "descending_triangle")):
        x, y = (h, l) if up else (l, h)
        for a, b in zip(flat[:-1], flat[1:]):
            if not (MIN_GAP <= b - a <= MAX_GAP) or _pct(x[a], x[b]) > FLAT_PCT:
                continue
            inside = other[(other > a) & (other < b)]
            before = other[other < a]
            if not inside.size or not before.size:
                continue
            p, q = before[-1], inside[-1]
            rising = y[q] > y[p] * 1.02 if up else y[q] < y[p] * 0.98
            if not rising:
                continue
            level = max(x[a], x[b]) if up else min(x[a], x[b])
            t = _break(c, b + PIVOT_N, b + MAX_WAIT, level, up, guard=y[q])
            if t is not None:
                add(t, name, f"{'Flat top' if up else 'Flat bottom'} at {level:.2f} with "
                              f"{'higher lows' if up else 'lower highs'}, closed {'above' if up else 'below'} it")

    # Candlesticks, only after a move they would reverse (close below/above its level 5 bars earlier)
    body = np.abs(c - o)
    rng = h - l
    upper = h - np.maximum(o, c)
    lower = np.minimum(o, c) - l
    for t in range(6, n):
        fell, rose = c[t - 1] < c[t - 6], c[t - 1] > c[t - 6]
        if rng[t] <= 0:
            continue
        if fell and c[t - 1] < o[t - 1] and c[t] > o[t] and o[t] <= c[t - 1] and c[t] >= o[t - 1] and body[t] > body[t - 1]:
            add(t, "bullish_engulfing", "A rising day swallowed the prior falling day after a decline")
        if rose and c[t - 1] > o[t - 1] and c[t] < o[t] and o[t] >= c[t - 1] and c[t] <= o[t - 1] and body[t] > body[t - 1]:
            add(t, "bearish_engulfing", "A falling day swallowed the prior rising day after a rise")
        if body[t] > 0 and body[t] >= 0.1 * rng[t]:
            if fell and lower[t] >= 2 * body[t] and upper[t] <= 0.5 * body[t]:
                add(t, "hammer", "Long lower shadow after a decline: sellers pushed it down and lost")
            if rose and upper[t] >= 2 * body[t] and lower[t] <= 0.5 * body[t]:
                add(t, "shooting_star", "Long upper shadow after a rise: buyers pushed it up and lost")
    out.sort(key=lambda e: e.i)
    return out


def forward(c: np.ndarray, i: int) -> float | None:
    """Return over the next HORIZON bars, in %."""
    j = i + HORIZON
    return None if j >= len(c) or c[i] <= 0 else (c[j] / c[i] - 1) * 100


RELIABLE_PCT = 0.25  # "held up": beat the average stock by this much, in its direction, in training and later
MIN_LATER = 100


def summarise(samples: list[tuple[str, str, float]], base: dict[str, tuple[float, int]], train_end: str) -> dict:
    """samples: (name, date, forward % return). Directional: a bearish pattern 'works' when the stock does worse
    than the average stock. base: period -> (sum, count) of every stock's HORIZON-bar return, for 'all',
    'train' and 'test', so each period is compared with its own market."""
    avg = {k: (v[0] / v[1] if v[1] else 0.0) for k, v in base.items()}
    out = {}
    for name in NAMES:
        sign = 1 if BIAS[name] == "bullish" else -1

        def block(rows, period):
            if not rows:
                return {"n": 0}
            r = np.array([x for _, _, x in rows])
            return {"n": int(r.size), "avg_pct": round(float(r.mean()), 3), "base_pct": round(avg[period], 3),
                    "edge_pct": round(float(sign * (r.mean() - avg[period])), 3),
                    "hit_pct": round(float((sign * r > 0).mean() * 100), 1)}

        mine = [s for s in samples if s[0] == name]
        tr = block([s for s in mine if s[1] <= train_end], "train")
        te = block([s for s in mine if s[1] > train_end], "test")
        reliable = (tr.get("edge_pct", 0) >= RELIABLE_PCT and te.get("edge_pct", 0) >= RELIABLE_PCT
                    and te.get("n", 0) >= MIN_LATER)
        out[name] = {"bias": BIAS[name], "horizon": HORIZON, **block(mine, "all"), "train": tr, "test": te,
                     "train_end": train_end, "reliable": reliable}
    return out
