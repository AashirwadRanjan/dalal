import Link from "next/link";
import Nav from "@/components/Nav";
import { getPatternStats, getSetups, getStates, type StockState } from "@/lib/db";
import { PATTERN_LABEL, frac, inr, pct, rMult, tone } from "@/lib/format";

export const dynamic = "force-dynamic";

const LEADER_RS = 80; // top 20% by 6-month return
const LAGGARD_RS = 20;

function StockTable({ rows, extra }: { rows: StockState[]; extra?: { label: string; cell: (s: StockState) => React.ReactNode } }) {
  if (!rows.length) return <p className="muted">Nothing matches today.</p>;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Stock</th>
            <th>Sector</th>
            <th>Close</th>
            <th>1 month</th>
            <th>3 months</th>
            <th>6 months</th>
            <th>From 52-wk high</th>
            {extra && <th>{extra.label}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.symbol}>
              <td>
                <Link href={`/stock/${encodeURIComponent(s.symbol)}`}>{s.symbol}</Link>
                <span className="name">{s.name}</span>
              </td>
              <td className="muted sector" title={s.sector}>{s.sector}</td>
              <td className="num">{inr(s.close)}</td>
              <td className={`num ${tone(s.ret_1m)}`}>{frac(s.ret_1m)}</td>
              <td className={`num ${tone(s.ret_3m)}`}>{frac(s.ret_3m)}</td>
              <td className={`num ${tone(s.ret_6m)}`}>{frac(s.ret_6m)}</td>
              <td className="num">{s.hi52 ? pct(((s.close - s.hi52) / s.hi52) * 100) : "–"}</td>
              {extra && <td className="num">{extra.cell(s)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OutlookPage() {
  const states = getStates();
  const bySym = new Map(states.map((s) => [s.symbol, s]));
  const stats = Object.fromEntries(getPatternStats().map((s) => [s.pattern, s]));
  const setups = getSetups().filter((s) => s.trend === "up");

  const leaders = states
    .filter((s) => s.trend === "up" && (s.rs_pct ?? 0) >= LEADER_RS && s.trail_stop != null && s.close > s.trail_stop)
    .sort((a, b) => (b.rs_pct ?? 0) - (a.rs_pct ?? 0));
  const pullbacks = leaders.filter((s) => s.dma50 != null && s.atr != null && Math.abs(s.close - s.dma50) <= s.atr);
  const laggards = states
    .filter((s) => s.trend === "down" && (s.rs_pct ?? 100) <= LAGGARD_RS)
    .sort((a, b) => (a.rs_pct ?? 0) - (b.rs_pct ?? 0));
  const breakdowns = states.filter((s) => s.breakdown).sort((a, b) => (b.volx ?? 0) - (a.volx ?? 0));
  const date = states[0]?.date;

  return (
    <main className="wrap">
      <Nav />
      <h1 className="pagetitle">Outlook</h1>
      <p className="lede">
        Screens over the Nifty 500 as of the {date ?? "latest"} close: what&apos;s strong, what&apos;s pulling back to a
        possible entry, and what&apos;s weak. These are filters, not predictions. The{" "}
        <Link href="/backtest">backtest</Link> shows no pattern with a reliable edge yet, uptrend or not.
      </p>

      <section className="osec">
        <h2>Long setups in uptrending stocks</h2>
        <p className="sub">
          Today&apos;s bullish pattern signals, only in stocks above rising 50- and 200-day averages. Enter next open;
          the stop and target come from the pattern.
        </p>
        {setups.length === 0 ? (
          <p className="muted">No bullish setups in uptrending stocks today.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Stock</th><th>Pattern</th><th>Entry</th><th>Stop</th><th>Target</th><th>6-month RS</th>
                  <th title="This pattern's backtest result when the stock was in an uptrend">Backtest in uptrends</th>
                </tr>
              </thead>
              <tbody>
                {setups.map((s) => {
                  const bt = stats[s.pattern]?.by_trend?.up;
                  return (
                    <tr key={s.symbol + s.pattern}>
                      <td><Link href={`/stock/${encodeURIComponent(s.symbol)}`}>{s.symbol}</Link><span className="name">{s.name}</span></td>
                      <td>{PATTERN_LABEL[s.pattern]}</td>
                      <td className="num">{inr(s.entry)}</td>
                      <td className="num">{inr(s.stop)}</td>
                      <td className="num">{inr(s.target)}</td>
                      <td className="num">{bySym.get(s.symbol)?.rs_pct?.toFixed(0) ?? "–"}</td>
                      <td className="num">
                        {bt?.trades ? <>{bt.trades} trades · <span className={tone(bt.avg_r)}>{rMult(bt.avg_r)}</span></> : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="osec">
        <h2>Pullbacks in leaders: possible entries</h2>
        <p className="sub">
          Leaders (below) that have pulled back to within one average daily range of their 50-day average. Buying near
          the 50-day average keeps the stop close; a close below the trailing stop says the idea failed.
        </p>
        <StockTable
          rows={pullbacks}
          extra={{ label: "Trailing stop", cell: (s) => inr(s.trail_stop) }}
        />
      </section>

      <section className="osec">
        <h2>Leaders: hold if you own them</h2>
        <p className="sub">
          Uptrend, top 20% by 6-month return, and above the trailing stop. {leaders.length} stocks. Holding while they
          stay above the trailing stop is the trend-following approach.
        </p>
        <StockTable
          rows={leaders.slice(0, 30)}
          extra={{ label: "Trailing stop", cell: (s) => inr(s.trail_stop) }}
        />
      </section>

      <section className="osec">
        <h2>Weak: avoid, or short via F&amp;O</h2>
        <p className="sub">
          Downtrend and bottom 20% by 6-month return. {laggards.length} stocks. You can&apos;t hold a short overnight in
          the cash market: shorting needs futures or options (only F&amp;O-listed stocks) or must be closed the same day.
        </p>
        <StockTable rows={laggards.slice(0, 30)} extra={{ label: "50-day avg", cell: (s) => inr(s.dma50) }} />
      </section>

      <section className="osec">
        <h2>Breakdowns today</h2>
        <p className="sub">Closed below the prior 20-day low on at least 1.5× average volume.</p>
        <StockTable rows={breakdowns} extra={{ label: "Volume", cell: (s) => (s.volx ? `${s.volx.toFixed(1)}x` : "–") }} />
      </section>
    </main>
  );
}
