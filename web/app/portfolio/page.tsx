import type { Metadata } from "next";
import Link from "next/link";
import HoldingForms from "@/components/HoldingForms";
import { ActionTag, Bar, type Action } from "@/components/ui";
import { MAX_LOSS, MAX_WEIGHT, advise } from "@/lib/advice";
import { getInstruments, getSetups, getStates } from "@/lib/db";
import { inr, pct, rupees, toneOf } from "@/lib/format";
import { listHoldings } from "@/lib/portfolio";
import { removeHolding } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portfolio" };

const ORDER: Action[] = ["Exit", "Review", "Add", "Hold"];

export default function PortfolioPage() {
  const holdings = listHoldings();
  const states = new Map(getStates().map((s) => [s.symbol, s]));
  const setups = getSetups();

  const base = holdings.map((h) => {
    const st = states.get(h.symbol);
    const price = st?.close ?? null;
    const cost = h.qty * h.avg_price;
    const value = price != null ? h.qty * price : cost;
    return { h, st, price, cost, value };
  });
  const total = base.reduce((a, r) => a + r.value, 0);
  const invested = base.reduce((a, r) => a + r.cost, 0);
  const day = base.reduce((a, r) => (r.st?.chg_1d != null ? a + (r.value - r.value / (1 + r.st.chg_1d)) : a), 0);
  const rows = base
    .map((r) => {
      const weight = total ? (r.value / total) * 100 : 0;
      return { ...r, weight, pl: r.value - r.cost, advice: advise(r.st, r.h.avg_price, weight, setups) };
    })
    .sort((a, b) => ORDER.indexOf(a.advice.action) - ORDER.indexOf(b.advice.action) || b.value - a.value);

  const n = (a: Action) => rows.filter((r) => r.advice.action === a).length;
  const exits = n("Exit"), reviews = n("Review"), adds = n("Add");
  const attention =
    exits + reviews
      ? {
          title: `${exits + reviews} holding${exits + reviews === 1 ? " needs" : "s need"} a look`,
          text: `${exits} exit rule${exits === 1 ? "" : "s"} and ${reviews} review${reviews === 1 ? "" : "s"} fired today.${adds ? ` ${adds} holding${adds === 1 ? " has" : "s have"} an add rule.` : ""}`,
        }
      : { title: "Nothing needs a look", text: `No exit or review rule fired today.${adds ? ` ${adds} holding${adds === 1 ? " has" : "s have"} an add rule.` : ""}` };
  const pl = total - invested;

  return (
    <main className="wrap">
      <section className="page-head">
        <h1 className="page-title">Portfolio</h1>
        <p className="page-lede">Your holdings, checked against the same rules as the rest of Dalal. They are stored only on this computer.</p>
      </section>

      {rows.length > 0 ? (
        <>
          <div className="figs" style={{ paddingBottom: 36 }}>
            <div><div className="fig-label">Value now</div><div className="fig-l">₹{inr(total, 0)}</div></div>
            <div><div className="fig-label">Invested</div><div className="fig-l">₹{inr(invested, 0)}</div></div>
            <div>
              <div className="fig-label">Total profit or loss</div>
              <div className={`fig-l ${toneOf(pl)}`}>{rupees(pl)}</div>
              <div className={`mono ${toneOf(pl)}`} style={{ fontSize: 14 }}>{pct((pl / invested) * 100, 1)}</div>
            </div>
            <div>
              <div className="fig-label">Today</div>
              <div className={`fig-l ${toneOf(day)}`}>{rupees(day)}</div>
            </div>
          </div>

          <div className="band" role="status">
            <strong>{attention.title}</strong>
            <span className="txt">{attention.text}</span>
          </div>

          <div style={{ marginTop: 32 }} className="panel tbl-wrap" role="region" aria-label="Holdings" tabIndex={0}>
            <div className="tbl-pad" style={{ minWidth: 1040 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Stock</th><th className="r">Qty</th><th className="r">Avg cost</th><th className="r">Price</th>
                    <th className="r">Value</th><th className="r">Profit or loss</th><th style={{ width: "12%" }}>Share of portfolio</th>
                    <th style={{ width: "26%" }}>Rule says</th><th><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ h, st, price, value, pl, cost, weight, advice }) => (
                    <tr key={h.symbol}>
                      <td>
                        <Link className="sym" href={`/stock/${encodeURIComponent(h.symbol)}`}>{h.symbol}</Link>
                        <span className="nm">{st?.name ?? "No price data"}</span>
                      </td>
                      <td className="n">{h.qty.toLocaleString("en-IN")}</td>
                      <td className="n">{inr(h.avg_price)}</td>
                      <td className="n">{inr(price)}</td>
                      <td className="n">₹{inr(value, 0)}</td>
                      <td className={`n ${toneOf(pl)}`}>
                        {rupees(pl)}
                        <span className="sub-n" style={{ color: "inherit" }}>{pct((pl / cost) * 100, 1)}</span>
                      </td>
                      <td>
                        <span style={{ display: "grid", gridTemplateColumns: "1fr 48px", gap: 8, alignItems: "center" }}>
                          <Bar value={Math.min(1, (weight * 2.2) / 100)} size="thin" tone={weight > MAX_WEIGHT ? "amber" : "flat"} />
                          <span className="mono" style={{ fontSize: 13, textAlign: "right" }}>{weight.toFixed(1)}%</span>
                        </span>
                      </td>
                      <td>
                        <ActionTag action={advice.action} />
                        <span style={{ display: "block", fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>{advice.reason}</span>
                      </td>
                      <td>
                        <form action={removeHolding}>
                          <input type="hidden" name="symbol" value={h.symbol} />
                          <button className="icon-btn" aria-label={`Remove ${h.symbol}`} title={`Remove ${h.symbol}`}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                              <path d="M2 2l10 10M12 2 2 12" />
                            </svg>
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="note" style={{ maxWidth: 820 }}>
            Rules: Add means a leader with an open uptrend setup. Review means over {MAX_WEIGHT}% of the portfolio or down{" "}
            {Math.abs(MAX_LOSS)}% or more from your cost. Exit means the stock closed below its trailing stop (the 22-day
            high minus three average daily ranges). Hold means no rule fired. These are rules, not advice, and they have not
            been backtested.
          </div>
        </>
      ) : (
        <div className="panel" style={{ border: "1px dashed var(--chip-line)", padding: "40px 36px" }}>
          <h2 className="sec-title" style={{ marginBottom: 8 }}>No holdings yet</h2>
          <p style={{ margin: 0, maxWidth: 560, color: "var(--text-2)" }}>
            Add what you own below, one stock at a time or pasted in bulk. Dalal will check each one against its rules and
            flag anything that needs a look.
          </p>
        </div>
      )}

      <HoldingForms symbols={getInstruments()} />
    </main>
  );
}
