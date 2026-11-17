import Link from "next/link";
import HoldingForms from "@/components/HoldingForms";
import Nav from "@/components/Nav";
import { BIG_SECTOR_PCT, advise, type Action } from "@/lib/advice";
import { getInstruments, getSetups, getStates } from "@/lib/db";
import { inr, pct, tone } from "@/lib/format";
import { listHoldings } from "@/lib/portfolio";
import { removeHolding } from "./actions";

export const dynamic = "force-dynamic";

const ACTION_ORDER: Action[] = ["Exit", "Review", "Add", "Hold"];

export default function PortfolioPage() {
  const holdings = listHoldings();
  const states = new Map(getStates().map((s) => [s.symbol, s]));
  const setups = getSetups();

  const rows = holdings.map((h) => {
    const st = states.get(h.symbol);
    const ltp = st?.close ?? null;
    const invested = h.qty * h.avg_price;
    const value = ltp != null ? h.qty * ltp : invested;
    return { h, st, ltp, invested, value, pnl: value - invested };
  });
  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  const totalInvested = rows.reduce((a, r) => a + r.invested, 0);
  const dayPnl = rows.reduce((a, r) => (r.st?.chg_1d != null ? a + (r.value - r.value / (1 + r.st.chg_1d)) : a), 0);

  const withAdvice = rows
    .map((r) => ({ ...r, weight: totalValue ? (r.value / totalValue) * 100 : 0 }))
    .map((r) => ({ ...r, advice: advise(r.st, r.h, r.weight, setups) }))
    .sort((a, b) => ACTION_ORDER.indexOf(a.advice.action) - ACTION_ORDER.indexOf(b.advice.action) || b.value - a.value);

  const sectorW = new Map<string, number>();
  for (const r of withAdvice) {
    const sec = r.st?.sector || "Unknown";
    sectorW.set(sec, (sectorW.get(sec) ?? 0) + r.weight);
  }
  const sectors = [...sectorW].sort((a, b) => b[1] - a[1]);
  const heavy = sectors.filter(([, w]) => w > BIG_SECTOR_PCT);
  const counts = Object.fromEntries(ACTION_ORDER.map((a) => [a, withAdvice.filter((r) => r.advice.action === a).length]));

  return (
    <main className="wrap">
      <Nav />
      <h1 className="pagetitle">My portfolio</h1>
      <p className="lede">
        Enter what you hold and at what average price. Each holding gets a suggestion from a few fixed rules, with the
        reason shown. The rules are listed at the bottom; they haven&apos;t been backtested, so use them as a checklist.
      </p>

      {rows.length > 0 && (
        <>
          <div className="strip">
            <div>
              <div className="label">Current value</div>
              <div className="value num">₹{inr(totalValue, 0)}</div>
              <div className="delta muted num">Invested ₹{inr(totalInvested, 0)}</div>
            </div>
            <div>
              <div className="label">Total P&amp;L</div>
              <div className={`value num ${tone(totalValue - totalInvested)}`}>
                {totalValue - totalInvested >= 0 ? "+" : "−"}₹{inr(Math.abs(totalValue - totalInvested), 0)}
              </div>
              <div className={`delta num ${tone(totalValue - totalInvested)}`}>
                {pct(((totalValue - totalInvested) / totalInvested) * 100)}
              </div>
            </div>
            <div>
              <div className="label">Today</div>
              <div className={`value num ${tone(dayPnl)}`}>{dayPnl >= 0 ? "+" : "−"}₹{inr(Math.abs(dayPnl), 0)}</div>
              <div className={`delta num ${tone(dayPnl)}`}>{pct((dayPnl / (totalValue - dayPnl)) * 100)}</div>
            </div>
            <div>
              <div className="label">Suggestions</div>
              <div className="value num" style={{ fontSize: 16, paddingTop: 6 }}>
                {ACTION_ORDER.filter((a) => counts[a]).map((a) => `${counts[a]} ${a}`).join(" · ")}
              </div>
            </div>
          </div>

          {heavy.length > 0 && (
            <p className="callout warnline">
              Concentration: {heavy.map(([s, w]) => `${s} is ${w.toFixed(0)}%`).join(", ")} of your portfolio (above{" "}
              {BIG_SECTOR_PCT}% in one sector). A bad day for that sector hits you hard.
            </p>
          )}

          <div className="tablewrap" style={{ marginTop: 20 }}>
            <table className="pftable">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Suggestion</th>
                  <th>Qty</th>
                  <th>Avg cost</th>
                  <th>Price</th>
                  <th>Value</th>
                  <th>P&amp;L</th>
                  <th>Weight</th>
                  <th><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {withAdvice.map(({ h, st, ltp, value, pnl, invested, weight, advice }) => (
                  <tr key={h.symbol}>
                    <td>
                      <Link href={`/stock/${encodeURIComponent(h.symbol)}`}>{h.symbol}</Link>
                      <span className="name">{st?.name ?? "Not in Nifty 500 data"}</span>
                    </td>
                    <td className="advice">
                      <span className={`pill pill-${advice.action.toLowerCase()}`}>{advice.action}</span>
                      <span className="why">{advice.reason}</span>
                      {advice.notes.map((n) => (
                        <span key={n} className="why note">{n}</span>
                      ))}
                    </td>
                    <td className="num">{h.qty.toLocaleString("en-IN")}</td>
                    <td className="num">{inr(h.avg_price)}</td>
                    <td className="num">
                      {inr(ltp)}
                      {st?.chg_1d != null && <span className={`name ${tone(st.chg_1d)}`}>{pct(st.chg_1d * 100)}</span>}
                    </td>
                    <td className="num">{inr(value, 0)}</td>
                    <td className={`num ${tone(pnl)}`}>
                      {pnl >= 0 ? "+" : "−"}{inr(Math.abs(pnl), 0)}
                      <span className="name">{pct((pnl / invested) * 100)}</span>
                    </td>
                    <td className="num">{weight.toFixed(1)}%</td>
                    <td>
                      <form action={removeHolding}>
                        <input type="hidden" name="symbol" value={h.symbol} />
                        <button className="linkbtn" aria-label={`Remove ${h.symbol}`}>Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="sub" style={{ marginTop: 8 }}>
            Sector split: {sectors.map(([s, w]) => `${s} ${w.toFixed(0)}%`).join(" · ")}
          </p>
        </>
      )}

      <HoldingForms symbols={getInstruments()} />

      <section className="method">
        <h2>How suggestions are made</h2>
        <p className="muted">The first rule that matches sets the suggestion:</p>
        <ul>
          <li><strong>Exit:</strong> the price closed below its trailing stop, the 22-day high minus 3 times the average daily range. A common way to let winners run and cut losers.</li>
          <li><strong>Review:</strong> the stock is in a downtrend, below its 50- and 200-day averages with both falling.</li>
          <li><strong>Add:</strong> the stock is in an uptrend and a bullish pattern setup fired on the latest close.</li>
          <li><strong>Hold:</strong> none of the above. The trailing stop is the level to watch.</li>
          <li>Notes for positions over 20% of the portfolio, gains over 50% and losses over 20% don&apos;t change the suggestion.</li>
          <li>
            <strong>Limits:</strong> prices are end-of-day, only Nifty 500 stocks can be analysed, and none of these rules
            has been tested for profitability. The <Link href="/backtest">pattern backtest</Link> currently shows no
            pattern with a reliable edge. Not investment advice.
          </li>
        </ul>
        <p className="muted">Holdings are stored only on this computer, in <code>data/portfolio.db</code>.</p>
      </section>
    </main>
  );
}
