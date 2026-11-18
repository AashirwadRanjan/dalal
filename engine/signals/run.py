"""Recompute signals, backtest trades, per-pattern stats and the per-stock state snapshot.

Rebuilt from scratch each run (a few seconds), so tweaking a detector and re-running
gives a clean, consistent backtest.
"""
import json
import math

import numpy as np
import pandas as pd

from engine.signals import backtest, chart_patterns, patterns, rulecheck, state, timeframes

MIN_TURNOVER = 5e7  # Rs 5 crore average daily traded value; thinner stocks are skipped
VARIANTS = ["base", "regime", "trail", "regime_trail"]  # base must stay first

STATE_COLS = ["date", "close", "chg_1d", "dma50", "dma200", "trend", "ret_1m", "ret_3m", "ret_6m",
              "rs_pct", "atr", "trail_stop", "hi52", "lo52", "volx", "low20", "breakdown",
              "rsi14", "macd", "macd_signal", "macd_hist", "bb_up", "bb_mid", "bb_low", "support", "resistance",
              "bo_level", "bd_level", "vol_needed"]


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
    # Backtest stats, the benchmark and screens use the Nifty 500 only; stocks you added outside it still get
    # setups, state and trades on their own pages.
    universe = {r[0] for r in conn.execute("SELECT symbol FROM instruments WHERE in_index = 1")}
    prices = pd.read_sql(
        "SELECT symbol, date, open, high, low, close, volume FROM prices_daily ORDER BY symbol, date",
        conn,
    ).dropna(subset=["open", "high", "low", "close"])
    prices["volume"] = prices["volume"].fillna(0)

    cp_rows, cp_samples = [], []
    cp_base = {k: (0.0, 0) for k in ("all", "train", "test")}
    regime_up = market_regime(conn)
    # Market filter, per side: longs only while the Nifty 50 is above its 200-day average, shorts only below
    in_regime = lambda s: regime_up.get(s.date) is (s.side == "long")
    sig_rows, trade_rows, latest, illiquid, tagged = [], [], [], 0, []
    variant_trades: dict[str, list] = {v: [] for v in VARIANTS}
    for sym, df in prices.groupby("symbol", sort=False):
        df = df.set_index("date")
        ind = state.indicators(df)
        last = ind.iloc[-1].copy()
        last["date"], last["symbol"] = ind.index[-1], sym
        last["support"], last["resistance"] = state.levels(df)
        latest.append(last)

        # Chart patterns: visible ones for every stock, 10-year samples for the Nifty 500 only
        closes = df["close"].to_numpy(float)
        for ev in chart_patterns.detect(df):
            if ev.i >= len(df) - chart_patterns.RECENT:
                cp_rows.append((sym, ev.date, ev.name, ev.bias, ev.detail))
            if sym in universe:
                f = chart_patterns.forward(closes, ev.i)
                if f is not None:
                    cp_samples.append((ev.name, ev.date, f))
        if sym in universe and len(closes) > chart_patterns.HORIZON:
            fwd = (closes[chart_patterns.HORIZON:] / closes[:-chart_patterns.HORIZON] - 1) * 100
            in_train = np.array(df.index[:-chart_patterns.HORIZON]) <= backtest.TRAIN_END
            ok = np.isfinite(fwd)
            for k, m in (("all", ok), ("train", ok & in_train), ("test", ok & ~in_train)):
                cp_base[k] = (cp_base[k][0] + float(fwd[m].sum()), cp_base[k][1] + int(m.sum()))

        raw = patterns.detect(df)
        # Liquidity: average daily traded value over the 20 days before the signal (no lookahead)
        turnover = (df["close"] * df["volume"]).shift(1).rolling(20).mean().to_numpy()
        sigs = [s for s in raw if np.isfinite(turnover[s.i]) and turnover[s.i] >= MIN_TURNOVER]
        illiquid += len(raw) - len(sigs)
        if not sigs:
            continue
        trend_at = ind["trend"].to_numpy()
        sig_rows += [(sym, s.date, s.pattern, s.side, trend_at[s.i], s.entry, s.stop, s.target, s.detail) for s in sigs]
        arr = [df[k].to_numpy(float) for k in ("open", "high", "low", "close")]
        dates = df.index.to_list()
        trails = {"long": ind["trail_stop"].to_numpy(), "short": ind["trail_stop_short"].to_numpy()}
        runs = {v: [] for v in VARIANTS}
        for side in ("long", "short"):
            mine = [s for s in sigs if s.side == side]
            reg = [s for s in mine if in_regime(s)]
            tr = trails[side]
            runs["base"] += backtest.run_symbol(mine, *arr, dates)
            runs["regime"] += backtest.run_symbol(reg, *arr, dates)
            runs["trail"] += backtest.run_symbol(mine, *arr, dates, mode="trail", trail=tr)
            runs["regime_trail"] += backtest.run_symbol(reg, *arr, dates, mode="trail", trail=tr)
        sig_i = {(s.date, s.pattern): s.i for s in sigs}
        for v, trades in runs.items():
            for t in trades:
                t.trend = trend_at[sig_i[(t.signal_date, t.pattern)]]
            if sym in universe:
                variant_trades[v] += trades
        if sym in universe:
            o_arr, c_arr = arr[0], arr[3]
            for t in runs["base"]:
                i = sig_i[(t.signal_date, t.pattern)]
                tagged.append((t, rulecheck.features(t, i, ind, o_arr, c_arr, regime_up.get(t.signal_date))))
        trade_rows += [
            (sym, t.pattern, t.side, t.signal_date, t.trend, t.entry_date, t.entry, t.stop, t.target,
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
    in_u = snap["symbol"].isin(universe)
    snap["rs_pct"] = snap["ret_6m"].where(in_u).rank(pct=True) * 100  # rank within the Nifty 500
    if (~in_u).any():  # added stocks: percentile they would have among the Nifty 500
        ref = np.sort(snap.loc[in_u, "ret_6m"].dropna().to_numpy())
        if ref.size:
            snap.loc[~in_u, "rs_pct"] = [np.searchsorted(ref, x, side="right") / ref.size * 100 if np.isfinite(x) else np.nan
                                         for x in snap.loc[~in_u, "ret_6m"]]
    snap["breakdown"] = snap["breakdown"].astype(bool).astype(int)
    state_rows = [(r["symbol"], *(_clean(r[c]) for c in STATE_COLS)) for _, r in snap.iterrows()]

    checks = rulecheck.run(tagged)
    cp_stats = chart_patterns.summarise(cp_samples, cp_base, backtest.TRAIN_END)
    tf_status, tf_stats, tf_note = timeframes.run(prices, universe)
    bench = benchmark(prices[prices["symbol"].isin(universe)])

    with conn:  # one transaction: the dashboard never sees a half-rebuilt state
        for t in ("signals", "trades", "pattern_stats", "stock_state", "tf_status", "tf_stats", "benchmark_daily",
                  "chart_patterns", "chart_pattern_stats", "rule_checks"):
            conn.execute(f"DELETE FROM {t}")
        conn.executemany("INSERT INTO signals (symbol, date, pattern, side, trend, entry, stop, target, detail) "
                         "VALUES (?,?,?,?,?,?,?,?,?)", sig_rows)
        conn.executemany(
            "INSERT INTO trades (symbol, pattern, side, signal_date, trend, entry_date, entry, stop, target, "
            "exit_date, exit, outcome, r, ret_pct, bars) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
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
        conn.executemany("INSERT OR IGNORE INTO chart_patterns VALUES (?,?,?,?,?)", cp_rows)
        conn.executemany("INSERT INTO chart_pattern_stats VALUES (?,?)", [(k, json.dumps(v)) for k, v in cp_stats.items()])
        conn.executemany("INSERT INTO rule_checks VALUES (?,?)", [(k, json.dumps(v)) for k, v in checks.items()])

    closed = sum(t.outcome != "open" for t in all_trades)
    return (f"{len(sig_rows)} setups ({illiquid} skipped as illiquid), {closed} closed backtest trades, "
            f"{len(state_rows)} stock states, {len(cp_samples)} past chart patterns; {tf_note}")
