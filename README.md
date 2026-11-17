# Dalal

Personal research dashboard for the Indian market, for one person, run locally on end-of-day data.
A Python engine writes one SQLite file (`data/market.db`); a Next.js app reads it.
Personal research tool. Not investment advice.

```
engine/            Python: fetches data, computes everything, writes data/market.db
  ingest/          Nifty 500 list, daily prices, indices and world series, FII/DII, FII/DII CSV import
  signals/         pattern detectors, backtester (walk-forward, per year, benchmark), trend and indicator
                   state, weekly/monthly setups
  summary.py       daily brief: hero, five brief lines, headlines (rule-based, from the data)
  alerts.py        Telegram alert after the daily run (optional)
web/               Next.js 16 app over data/market.db (dark design, IBM Plex)
scripts/           install-schedule.sh (launchd), test.sh
data/              market.db, portfolio.db (holdings + watchlist), engine.log (all gitignored)
```

## Pages

| Route | What it shows |
|---|---|
| `/` Today | Generated headline, indices, today's brief, setups preview, your watchlist, fund flows, breadth, sectors, outlook counts, world, reality check |
| `/setups` | Every setup from the latest close, filter by pattern and uptrends, sort by volume, risk or reward vs risk; CSV download |
| `/outlook` | Leaders, pullbacks, uptrend setups, weak stocks, breakdowns (`?tab=`) |
| `/portfolio` | Holdings, totals, "Rule says" Add / Hold / Review / Exit with the rule, add and paste import, CSV download |
| `/backtest` | Results by pattern, running total, weekly bars, out-of-sample split, each year, buy-and-hold benchmark, caveats |
| `/stock/[symbol]` | Overview (short and long term cards, Daily/Weekly/Monthly chart), Technicals (indicators, price ladder), News and events (`?tab=`), watchlist star |
| `/health` | Each engine step's last run, status and findings; sources that can break |
| `/brief` | Brief archive with a date picker |

## Run it

```bash
# 1. engine (from repo root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r engine/requirements.txt
python -m engine.run_daily --backfill      # first run: ~2 years of history

# 2. web (listens on 127.0.0.1 only)
cd web && npm install && npm run dev       # http://127.0.0.1:3000

# 3. daily updates (macOS, from repo root)
scripts/install-schedule.sh                # weekdays 18:45, macOS notification; remove with --remove
```

The **Fetch latest** button in the header runs the same engine on demand (about 20 s).

### Optional

- **Telegram alert:** copy `.env.example` to `.env`, fill `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. The scheduled run then
  sends the brief and any failed steps. Without it, the macOS notification is the only alert.
- **FII/DII history:** NSE only returns the latest day. To add earlier days, save them yourself as a CSV and run
  `python -m engine.ingest.fii_dii_import data/fii_dii_history.csv` (format: `engine/ingest/fii_dii_history.example.csv`).
  Existing days are never overwritten.

## What the backtest says (Nov 2026)

- **No setup has an edge.** Daily breakouts and volume spikes lost money after costs; support bounces broke even overall.
- **Out of sample:** judged on trades entered up to 2025-12-31, only support bounces passed (+0.21R); in 2026 they lost
  (−0.22R). All three patterns were better in 2025 than in 2026: the market phase dominates.
- **Weekly bars** look positive in sample (small samples, same period). Treat as a lead to test, not an edge.
  Monthly bars need 60 months; we have 24.
- Universe is today's Nifty 500 (survivorship flatters longs). Outlook groups, portfolio rules and the long-term verdict are
  rules, not forecasts, and are not backtested.

## Data sources and terms

| Source | Used for | Notes |
|---|---|---|
| Yahoo Finance (yfinance) | Prices, indices, world | Unofficial, end of day, personal use. Not dividend adjusted; a few stocks missing |
| NSE archives CSV | Nifty 500 list | Fallback: save it as `data/nifty500.csv` |
| NSE website API | Daily FII/DII | NSE's terms of use prohibit automated collection. Kept for personal use; consider replacing with a licensed feed |
| Telegram Bot API | Alerts | Official API |
| News, corporate events, X buzz | Not set up | Shown as "Not tracked" until a source is chosen |

## Tests

```bash
scripts/test.sh            # engine tests + web typecheck
scripts/test.sh --build    # also the production build
```

Covers the trade simulator, no-lookahead checks on detectors and indicators, RSI/MACD/Bollinger and swing levels, weekly
and monthly resampling, walk-forward and per-year stats, the benchmark, the daily brief text, Telegram message building,
and the FII/DII import.

Security: the server binds to 127.0.0.1; `/api/refresh` accepts same-origin requests only and reuses the last result for
60 seconds; server actions get Next's Origin/Host check.

## Roadmap

1. ~~Data pipeline and dashboard~~
2. ~~Pattern engine and backtester~~, plus walk-forward, weekly/monthly, brief, outlook, portfolio, watchlist
3. News and events: needs a source decision (licensed API vs RSS vs none) and an LLM key; tables and UI are ready
4. IPO desk: GMP has no official source
5. Fundamentals scoring, PCR / OI; ~~Telegram alerts~~
