import Link from "next/link";
import type { Brief, Mover } from "@/lib/db";
import { pct, tone } from "@/lib/format";

function Movers({ title, rows, vol }: { title: string; rows: Mover[]; vol?: boolean }) {
  return (
    <div>
      <h3>{title}</h3>
      <ul className="cues">
        {rows.map((m) => (
          <li key={m.symbol}>
            <Link href={`/stock/${encodeURIComponent(m.symbol)}`}>{m.symbol}</Link>
            <span className="num muted">{vol && m.volx ? `${m.volx}x vol` : ""}</span>
            <span className={`num ${tone(m.chg)}`}>{pct(m.chg)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Headlines only (homepage) or the full brief with movers and breadth (/brief). */
export default function BriefView({ brief, full = false }: { brief: Brief; full?: boolean }) {
  const b = brief.breadth;
  return (
    <section className="brief">
      {!full && (
        <h2>
          Daily brief <span className="muted" style={{ fontWeight: 400 }}>· {brief.date}</span>
        </h2>
      )}
      <ul className="headlines">
        {brief.headlines.map((h) => (
          <li key={h.text} className={`hl-${h.tone}`}>{h.text}</li>
        ))}
      </ul>
      {!full && (
        <p className="sub" style={{ marginTop: 6 }}>
          <Link href="/brief">Full brief: movers, breadth, sectors</Link> · <Link href="/outlook">Outlook</Link>
        </p>
      )}

      {full && (
        <>
          <div className="facts num" style={{ marginTop: 20 }}>
            <span><span>Advances / declines</span>{b.advances} / {b.declines}</span>
            <span><span>Above 50-day avg</span>{b.pct_above_50dma}%</span>
            <span><span>Above 200-day avg</span>{b.pct_above_200dma}%</span>
            <span><span>Up / sideways / down trends</span>{b.trend.up} / {b.trend.sideways} / {b.trend.down}</span>
          </div>
          <div className="movers">
            <Movers title="Top gainers" rows={brief.gainers} />
            <Movers title="Top losers" rows={brief.losers} />
            <Movers title="Unusual volume" rows={brief.volume} vol />
          </div>
          <div className="movers" style={{ marginTop: 24 }}>
            <div>
              <h3>Strongest sectors</h3>
              <ul className="cues">
                {brief.sectors_top.map((s) => (
                  <li key={s.sector}><span>{s.sector}</span><span className="num muted">{s.n} stocks</span><span className={`num ${tone(s.chg)}`}>{pct(s.chg)}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Weakest sectors</h3>
              <ul className="cues">
                {brief.sectors_bottom.map((s) => (
                  <li key={s.sector}><span>{s.sector}</span><span className="num muted">{s.n} stocks</span><span className={`num ${tone(s.chg)}`}>{pct(s.chg)}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Global cues</h3>
              <ul className="cues">
                {brief.global.slice(0, 6).map((g) => (
                  <li key={g.name}><span>{g.name}</span><span /><span className={`num ${tone(g.chg)}`}>{pct(g.chg)}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
