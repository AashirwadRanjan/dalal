"""Learning from losses, without fooling ourselves.

Every backtest trade is tagged with facts known when it was taken (trend, market, volume, RSI, stop width, the gap
at the open...). For each pattern and each candidate filter below, we compare trades that pass the filter with all
trades, first on the training years, then on the untouched later period.

The list is fixed in advance. Trying many filters means some will look good by luck, so a filter is called
"promising" only if it helped in training AND later, on enough later trades. Even then it is a lead to watch in the
live record, not a rule change: adding it to the rules is a decision for you.
"""
import numpy as np

from engine.signals import backtest

MIN_GAIN = 0.05      # must add at least this much average R...
MIN_LATER = 100      # ...on at least this many later trades


def _side(t) -> int:
    return -1 if t.side == "short" else 1


# name -> (plain description, test on a trade's features)
FILTERS = {
    "trend_agrees": ("The stock's own trend points the same way (uptrend for longs, downtrend for shorts)",
                     lambda f: f["trend"] == ("up" if f["sgn"] > 0 else "down")),
    "market_agrees": ("The Nifty 50 is on the same side of its 200-day average",
                      lambda f: f["market_up"] is (f["sgn"] > 0)),
    "past_200": ("The stock is on the same side of its own 200-day average",
                 lambda f: f["vs200"] is not None and f["vs200"] * f["sgn"] > 0),
    "momentum": ("Its 6-month return points the same way",
                 lambda f: f["ret6m"] is not None and f["ret6m"] * f["sgn"] > 0),
    "big_volume": ("Volume at least 2x its 20-day average on the setup day",
                   lambda f: f["volx"] is not None and f["volx"] >= 2),
    "not_stretched": ("RSI not stretched in the trade's direction (below 70 for longs, above 30 for shorts)",
                      lambda f: f["rsi"] is not None and (f["rsi"] < 70 if f["sgn"] > 0 else f["rsi"] > 30)),
    "tight_stop": ("Stop within 4% of the entry",
                   lambda f: f["risk_pct"] <= 4),
    "no_chase": ("The next open did not jump more than half a daily range in the trade's direction",
                 lambda f: f["gap_atr"] is not None and f["gap_atr"] <= 0.5),
}


def features(t, i: int, ind, o, c, market_up: bool | None) -> dict:
    """Facts known at the signal close (and the gap, known at the next open, before entering)."""
    sgn = _side(t)
    row = ind.iloc[i]
    num = lambda x: None if x is None or not np.isfinite(x) else float(x)
    atr = num(row["atr"])
    e = i + 1
    return {
        "sgn": sgn, "trend": row["trend"], "market_up": market_up,
        "vs200": num(c[i] - row["dma200"]) if np.isfinite(row["dma200"]) else None,
        "ret6m": num(row["ret_6m"]), "volx": num(row["volx"]), "rsi": num(row["rsi14"]),
        "risk_pct": abs(t.entry - t.stop) / t.entry * 100,
        "gap_atr": sgn * (o[e] - c[i]) / atr if atr and e < len(o) else None,
    }


def run(tagged: list[tuple]) -> dict:
    """tagged: (trade, features) for the universe's base trades. Returns {pattern: {...}}."""
    out = {}
    for p in sorted({t.pattern for t, _ in tagged}):
        mine = [(t, f) for t, f in tagged if t.pattern == p]
        allt = [t for t, _ in mine]
        base = backtest.walk_forward(allt)
        rows = {}
        for name, (label, test) in FILTERS.items():
            kept = [t for t, f in mine if test(f)]
            wf = backtest.walk_forward(kept)
            gain_tr = (wf["train"].get("avg_r") or 0) - (base["train"].get("avg_r") or 0)
            gain_te = (wf["test"].get("avg_r") or 0) - (base["test"].get("avg_r") or 0)
            rows[name] = {
                "label": label,
                "share": round(len(kept) / len(allt) * 100, 1) if allt else 0,
                "train": wf["train"], "test": wf["test"],
                "gain_train": round(gain_tr, 3), "gain_test": round(gain_te, 3),
                "promising": (wf["train"].get("trades", 0) >= backtest.MIN_TRADES and gain_tr >= MIN_GAIN
                              and wf["test"].get("trades", 0) >= MIN_LATER and gain_te >= MIN_GAIN),
            }
        out[p] = {"base": {"train": base["train"], "test": base["test"]}, "filters": rows,
                  "train_end": backtest.TRAIN_END}
    return out
