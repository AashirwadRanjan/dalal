import Link from "next/link";
import { notFound } from "next/navigation";
import Candles from "@/components/Candles";
import { change, inr, pct, tone } from "@/lib/format";
import { getStock } from "@/lib/db";

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

  return (
    <main className="wrap">
      <header className="top"><Link href="/" className="brand">Dalal</Link></header>
      <p className="crumb"><Link href="/">All stocks</Link></p>

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

      {candles.length > 0 ? <Candles candles={candles} /> : <p className="muted">No price history yet.</p>}
    </main>
  );
}
