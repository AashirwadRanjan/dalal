import Link from "next/link";
import EquityCurve from "@/components/EquityCurve";
import { getEquity, getPatternStats, getTrades } from "@/lib/db";
import { OUTCOME_LABEL, PATTERN_LABEL, PATTERN_ORDER, TREND_LABEL, inr, pct, rMult, tone } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function BacktestPage() {
  const stats = getPatternStats().sort((a, b) => PATTERN_ORDER.indexOf(a.pattern) - PATTERN_ORDER.indexOf(b.pattern));
  const equity = getEquity();
  const trades = getTrades({ limit: 100 });

  return (
    <main className="wrap">
      <h1 className="pagetitle">Pattern backtest</h1>
      <p className="lede">
        Every signal over the last two years, traded mechanically. Results are in <strong>R</strong>, multiples of
        the risk taken: +2R means the trade made twice what it risked; −1R means the stop was hit.
      </p>

      {stats.length === 0 ? (
        <div className="empty">
          <p>No backtest yet. It runs as part of the daily engine, or click <strong>Fetch latest</strong> on the dashboard.</p>
        </div>
      ) : (
        <>
          <div className="tablewrap">
            <table className="stats">
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Trades</th>
                  <th>Win rate</th>
                  <th>Avg per trade</th>
                  <th>Avg return</th>
                  <th>Profit factor</th>
                  <th>Avg hold</th>
                  <th>Max drawdown</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.pattern}>
                    <td>{PATTERN_LABEL[s.pattern] ?? s.pattern}</td>
                    <td className="num">{s.trades.toLocaleString("en-IN")}</td>
                    <td className="num">{s.win_rate == null ? "–" : `${s.win_rate}%`}</td>
                    <td className={`num ${tone(s.avg_r)}`}>{rMult(s.avg_r)}</td>
                    <td className={`num ${tone(s.avg_ret_pct)}`}>{pct(s.avg_ret_pct)}</td>
                    <td className="num">{s.profit_factor?.toFixed(2) ?? "–"}</td>
                    <td className="num">{s.avg_bars == null ? "–" : `${s.avg_bars} days`}</td>
                    <td className="num">{s.max_dd_r == null ? "–" : `−${s.max_dd_r}R`}</td>
                    <td className={`num ${tone(s.total_r)}`}>{rMult(s.total_r, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section style={{ marginTop: 36 }}>
            <h2>Cumulative result</h2>
            <p className="sub">Each closed trade adds its R on its exit day. Hover for values on a date.</p>
            <EquityCurve points={equity} />
          </section>

          <section style={{ marginTop: 36 }}>
            <h2>Does the stock&apos;s trend matter?</h2>
            <p className="sub">
              Average result per trade, split by the stock&apos;s trend on the signal day. &ldquo;Not enough
              history&rdquo; is the first ~200 trading days, before a 200-day average exists, so it is also the earliest
              period of the test. If that column is the only positive one, the edge came from that market phase, not
              from the trend filter.
            </p>
            <div className="tablewrap">
              <table className="stats">
                <thead>
                  <tr>
                    <th>Pattern</th>
                    {["up", "sideways", "down", "unknown"].map((t) => <th key={t}>{TREND_LABEL[t]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.pattern}>
                      <td>{PATTERN_LABEL[s.pattern] ?? s.pattern}</td>
                      {["up", "sideways", "down", "unknown"].map((t) => {
                        const b = s.by_trend?.[t];
                        return (
                          <td key={t} className="num">
                            {b?.trades ? (
                              <>
                                <span className={tone(b.avg_r)}>{rMult(b.avg_r)}</span>
                                <span className="name">{b.trades} trades · {b.win_rate}% won</span>
                              </>
                            ) : "–"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="method">
            <h2>How trades are simulated</h2>
            <ul>
              <li>Enter at the open of the day after the signal. If that open is already past the stop or target, no trade.</li>
              <li>Stop and target fill at their price; a gap through either fills at the open. If one day touches both, the stop counts first.</li>
              <li>Exit at the close after 20 trading days if neither level is hit. Costs: 0.1% per side.</li>
              <li>One trade at a time per stock per pattern.</li>
              <li>
                <strong>Caveats:</strong> two years is one market regime. The stock list is today&apos;s Nifty 500, so
                companies that fell out of it are missing, which flatters long trades. Treat these numbers as an upper bound.
              </li>
            </ul>
          </section>

          <section style={{ marginTop: 36 }}>
            <h2>Recent closed trades</h2>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Pattern</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Outcome</th>
                    <th>Days</th>
                    <th>Return</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.symbol + t.pattern + t.entry_date}>
                      <td><Link href={`/stock/${encodeURIComponent(t.symbol)}`}>{t.symbol}</Link></td>
                      <td>{PATTERN_LABEL[t.pattern]}</td>
                      <td className="num">{inr(t.entry)} <span className="muted">{t.entry_date}</span></td>
                      <td className="num">{inr(t.exit)} <span className="muted">{t.exit_date}</span></td>
                      <td style={{ textAlign: "left" }}>{OUTCOME_LABEL[t.outcome]}</td>
                      <td className="num">{t.bars}</td>
                      <td className={`num ${tone(t.ret_pct)}`}>{pct(t.ret_pct)}</td>
                      <td className={`num ${tone(t.r)}`}>{rMult(t.r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
