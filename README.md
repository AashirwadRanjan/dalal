# Dalal

Personal dashboard for the Indian market: prices, FII/DII flows, global cues, a stock screener, candlestick charts,
a pattern engine with backtests, a daily brief, outlook screens and a portfolio checker.
Built for one user, run locally. Python engine writes to one SQLite file; Next.js reads it.

```
engine/          Python: fetches data, writes data/market.db
  ingest/        prices, indices/global series, FII/DII, Nifty 500 list
  signals/       pattern detectors, backtester, per-stock trend state
  summary.py     daily brief (rule-based headlines)
web/             Next.js dashboard over data/market.db
data/            market.db and portfolio.db live here (gitignored)
```

## Pages

| Page | What it shows |
|---|---|
| Dashboard | Daily brief headlines, indices, FII/DII flows, global cues, today's pattern setups, stock screener |
| Daily brief | Full brief: breadth, movers, unusual volume, sector leaders/laggards; earlier days browsable |
| Outlook | Long setups in uptrends, pullbacks in leaders, leaders to hold, weak stocks (avoid / short via F&O), breakdowns |
| Portfolio | Your holdings with P&L and an Add / Hold / Review / Exit suggestion per stock, with the rule that produced it |
| Backtest | Per-pattern results in R, split by trend, cumulative curve, recent trades |

## Run it

```bash
# 1. engine (from repo root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r engine/requirements.txt
python -m engine.run_daily --backfill      # first run: ~2 years of history

# 2. web
cd web && npm install && npm run dev       # http://localhost:3000

# 3. schedule daily updates (macOS, from repo root)
scripts/install-schedule.sh
```

## Keep it fresh

Two ways, neither needs a terminal after setup:

- **Scheduled (macOS):** `scripts/install-schedule.sh` installs a launchd job that runs the engine weekdays at 6:45 pm, after NSE publishes FII/DII flows. If the Mac was asleep, it runs on wake. Output goes to `data/engine.log`. Remove with `scripts/install-schedule.sh --remove`.
- **On demand:** the **Fetch latest** button in the dashboard header runs the engine (about 20 s) and reloads the page.

Each step logs to the `ingest_log` table. If one fails, the dashboard header shows which.

## Things to know

- **FII/DII history builds one day per run.** NSE's endpoint only returns the latest day, so run the engine daily from the start.
- **NSE blocks scripts sometimes.** If the Nifty 500 list download fails, save the constituents CSV as `data/nifty500.csv` and re-run.
- **Prices come from Yahoo (yfinance)**: free, end-of-day, occasionally gappy. Fine for now; swap for a broker API later.
- **Gift Nifty isn't included**; Yahoo doesn't carry it reliably.
- **Portfolio holdings stay on this machine**, in `data/portfolio.db`, separate from market data, so rebuilding `market.db` never loses them.
- **Pattern backtest (as of Nov 2026): no pattern has a reliable edge.** Breakouts and volume spikes lost money after costs over two years; support bounces broke even. Trend filtering didn't help. Results were positive in year one and negative in year two, so the market phase dominates. The universe is today's Nifty 500 (survivorship bias flatters longs).
- **Outlook lists and portfolio suggestions are rules, not forecasts.** None is validated by the backtest yet.
- Not investment advice. Backtest any signal before acting on it.

## Tests

```bash
scripts/test.sh            # engine tests + web typecheck
scripts/test.sh --build    # also the production build
```

Covers the trade simulator (fills, gaps, costs, time exits), no-lookahead checks on the detectors and
indicators, trend/trailing-stop/breakdown rules, and the daily brief (breadth, headlines, one row per day).

The web server listens on 127.0.0.1 only. `/api/refresh` accepts same-origin requests only and reuses the
last result for 60 seconds.

## Next phases

2. ~~Pattern engine with entry/stop/target, plus a backtester~~ done; also daily brief, outlook, portfolio
   - Still open: backtest the portfolio exit rules and outlook screens; short-side (breakdown) backtest; walk-forward test
3. News layer: LLM turns headlines and filings into affected sectors/stocks
4. IPO desk: GMP, subscription (QIB / bNII / sNII / retail), valuation
5. Results/fundamentals scoring, PCR / OI, Telegram alerts
