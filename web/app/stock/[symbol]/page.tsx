import Link from "next/link";
import { notFound } from "next/navigation";
import Candles from "@/components/Candles";
import { OUTCOME_LABEL, PATTERN_CODE, PATTERN_LABEL, PATTERN_ORDER, change, inr, pct, rMult, tone } from "@/lib/format";
import { getStock, getStockSignals, getTrades } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);
  const data = getStock(symbol);
  if (!data) notFound();

  const { inst, candles } = data;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const chg = last && prev ? change(last.close, prev.close) : null;

  const year = candles.slice(-252);
  const hi = year.length ? Math.max(...year.map((c) => c.high)) : null;
  const lo = year.length ? Math.min(...year.map((c) => c.low)) : null;
  const vols = candles.slice(-21, -1).map((c) => c.volume ?? 0);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;

  const signals = getStockSignals(symbol);
  const trades = getTrades({ symbol, limit: 50 });
  // one marker per day; letters joined when several patterns fire together (e.g. "B V")
  const byDay = new Map<string, string[]>();
  for (const s of signals) byDay.set(s.date, [...(byDay.get(s.date) ?? []), PATTERN_CODE[s.pattern] ?? "?"]);
  const markers = [...byDay].map(([date, codes]) => ({ date, label: codes.join(" ") }));
  // Levels to draw: a signal on the latest bar (not entered yet), else a backtest trade still open
  const fresh = signals.filter((s) => s.date === last?.date);
  const open = trades.find((t) => t.outcome === "open");
  const active = fresh[0] ?? open;
  const levels = active ? { entry: active.entry, stop: active.stop, target: active.target } : undefined;

  return (
    <main className="wrap">

      <div className="stockhead">
        <h1>{inst.symbol}</h1>
        <div className="muted">{inst.name} · {inst.sector}</div>
        {last && (
          <div className="price num">
            ₹{inr(last.close)} <span className={`${tone(chg)}`} style={{ fontSize: 16 }}>{pct(chg)}</span>
          </div>
        )}
      </div>

      <div className="facts num">
        <span><span>52-week high</span>₹{inr(hi)}</span>
        <span><span>52-week low</span>₹{inr(lo)}</span>
        <span><span>20-day avg volume</span>{avgVol == null ? "–" : Math.round(avgVol).toLocaleString("en-IN")}</span>
        <span><span>Last candle</span>{last?.date ?? "–"}</span>
      </div>

      {active && (
        <p className="callout">
          {fresh.length > 0 ? (
            <><strong>{fresh.map((f) => PATTERN_LABEL[f.pattern]).join(" + ")}</strong> on the latest close. {fresh[0].detail}. </>
          ) : (
            <><strong>{PATTERN_LABEL[open!.pattern]}</strong> trade from {open!.entry_date} still open in the backtest. </>
          )}
          Entry ₹{inr(active.entry)}, stop ₹{inr(active.stop)}, target ₹{inr(active.target)}.
        </p>
      )}

      {candles.length > 0 ? (
        <Candles candles={candles} markers={markers} levels={levels} />
      ) : (
        <p className="muted">No price history yet.</p>
      )}
      {markers.length > 0 && (
        <p className="sub" style={{ marginTop: 8 }}>
          Arrows mark pattern signals:{" "}
          {PATTERN_ORDER.map((p) => `${PATTERN_CODE[p]} ${PATTERN_LABEL[p]}`).join(" · ")}
          {levels && <>. Dashed lines: entry, stop and target of the current setup.</>}
        </p>
      )}

      <section style={{ marginTop: 32 }}>
        <h2>Pattern history</h2>
        <p className="sub">
          Backtest trades for this stock, latest first. <Link href="/backtest">How they&apos;re simulated</Link>
        </p>
        {trades.length === 0 ? (
          <p className="muted">No signals for this stock in the last two years.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Signal</th>
                  <th>Pattern</th>
                  <th>Entry</th>
                  <th>Stop</th>
                  <th>Target</th>
                  <th>Exit</th>
                  <th>Outcome</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.pattern + t.entry_date}>
                    <td className="num">{t.signal_date}</td>
                    <td>{PATTERN_LABEL[t.pattern]}</td>
                    <td className="num">{inr(t.entry)}</td>
                    <td className="num">{inr(t.stop)}</td>
                    <td className="num">{inr(t.target)}</td>
                    <td className="num">{inr(t.exit)} <span className="muted">{t.exit_date}</span></td>
                    <td style={{ textAlign: "left" }}>{OUTCOME_LABEL[t.outcome]}</td>
                    <td className={`num ${tone(t.r)}`}>{rMult(t.r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
