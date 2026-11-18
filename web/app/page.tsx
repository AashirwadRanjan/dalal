import Link from "next/link";
import BriefLines from "@/components/BriefLines";
import RealityCheck from "@/components/RealityCheck";
import WatchlistSection from "@/components/WatchlistSection";
import { Bar, ChangeFigure, DashedNotice, TablePanel } from "@/components/ui";
import { getBrief, getFlows, getSeries, getSetups, getStates, hasDb, type Brief, type FlowRow, type SeriesRow } from "@/lib/db";
import { PATTERN_LABEL, PATTERN_ORDER, PATTERN_PLURAL, change, dayLong, dayShort, inr, plural, signed, toneOf } from "@/lib/format";
import { outlookGroups } from "@/lib/outlook";

export const dynamic = "force-dynamic";

const WORLD = ["S&P 500", "Nasdaq", "US 10Y yield", "USD/INR", "Dollar index", "Brent crude", "Gold"];
const WORLD_NAME: Record<string, string> = { "US 10Y yield": "US 10-year yield" };

export default function Today() {
  if (!hasDb()) {
    return (
      <main className="wrap">
        <section className="page-head">
          <h1 className="page-title">No data yet</h1>
          <p className="page-lede">
            Use Fetch latest above to build the database. The first run downloads two years of prices and takes a few minutes.
          </p>
        </section>
      </main>
    );
  }

  const brief = getBrief();
  const india = getSeries("india").filter((s) => s.name !== "India VIX");
  const world = getSeries("global");
  const flows = getFlows(20);
  const setups = getSetups();
  const groups = outlookGroups(getStates(), setups);

  return (
    <main className="wrap">
      {/* Hero */}
      <section className="hero">
        <div className="hero-text">
          <div style={{ fontSize: 15, color: "var(--muted)", fontWeight: 500 }}>{dayLong(brief?.date ?? india[0]?.date)}</div>
          <h1 className="hero-title">{brief?.hero?.headline ?? "Today’s market"}</h1>
          {brief?.hero && <p className="hero-para">{brief.hero.text}</p>}
        </div>
        <div className="panel hero-idx" role="group" aria-label="Indian indices, end of day">
          {india.map((ix) => (
            <div key={ix.symbol} className="idx-row">
              <span style={{ fontSize: 15, color: "var(--text-2)" }}>{ix.name}</span>
              <span style={{ textAlign: "right" }}>
                <span className="fig-m" style={{ display: "block" }}>{inr(ix.close)}</span>
                <ChangeFigure value={change(ix.close, ix.prev)} className="fig-sub" />
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Brief */}
      <section className="sec" aria-labelledby="brief-h">
        <h2 className="sec-title" id="brief-h">Today’s brief</h2>
        <p className="sec-sub">Five things that mattered, written from the data.</p>
        {brief?.lines ? <BriefLines lines={brief.lines} /> : <DashedNotice>The brief is written after the next run.</DashedNotice>}
        <div className="more-link"><Link href="/brief">Past days</Link></div>
      </section>

      {/* Setups */}
      <section className="sec" aria-labelledby="setups-h">
        <div className="sec-head">
          <h2 className="sec-title" id="setups-h">Setups today</h2>
          <span style={{ fontSize: 15, color: "var(--muted)" }}>
            <span className="mono" style={{ color: "var(--text)" }}>{setups.length}</span> found
            {setups.length > 0 && `: ${countsText(setups)}`}
          </span>
        </div>
        <div style={{ height: 20 }} />
        {setups.length === 0 ? (
          <DashedNotice>No setups fired on the latest close.</DashedNotice>
        ) : (
          <>
            <TablePanel minWidth={720}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Stock</th><th className="r">Entry</th><th className="r">Stop</th><th className="r">Target</th>
                    <th className="r">Reward vs risk</th>
                  </tr>
                </thead>
                <tbody>
                  {setups.slice(0, 2).map((s) => (
                    <tr key={s.symbol + s.pattern}>
                      <td>
                        <Link className="sym" href={`/stock/${encodeURIComponent(s.symbol)}`} style={{ fontSize: 18 }}>{s.symbol}</Link>
                        <span className="nm" style={{ fontSize: 14 }}>
                          {s.side === "short" ? "Short: " : "Long: "}
                          {PATTERN_LABEL[s.pattern]}
                          {s.volx ? `, ${s.volx.toFixed(1)}× average volume` : ""}
                        </span>
                      </td>
                      <td className="n">{inr(s.entry)}</td>
                      <td className="n down">{inr(s.stop)}</td>
                      <td className="n up">{inr(s.target)}</td>
                      <td className="n">{(Math.abs(s.target - s.entry) / Math.abs(s.entry - s.stop)).toFixed(1)} to 1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablePanel>
            <div className="note" style={{ fontSize: 15 }}>
              Showing the first {Math.min(2, setups.length)} of {setups.length}, most unusual volume first.{" "}
              <Link href="/setups" style={{ fontWeight: 500, textDecoration: "underline" }}>See all setups</Link>
            </div>
          </>
        )}
      </section>

      <WatchlistSection />

      {/* Flows + breadth */}
      <section className="sec cols">
        <Flows rows={flows} />
        {brief && <Breadth b={brief.breadth} />}
      </section>

      {/* Sectors, outlook, world */}
      <section className="sec" style={{ display: "flex", flexWrap: "wrap", gap: 56 }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h2 className="sec-title" style={{ marginBottom: 20 }}>Leading sectors</h2>
          <Sectors rows={(brief?.sectors_top ?? []).filter((s) => s.chg > 0)} />
          <h2 className="sec-title" style={{ margin: "40px 0 16px" }}>Outlook</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
            {(
              [
                [groups.leaders.length, "Leaders"],
                [groups.weak.length, "Laggards"],
                [groups.uptrendSetups.length, "Uptrend setups"],
              ] as const
            ).map(([n, l]) => (
              <div key={l}>
                <div className="mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>{n}</div>
                <div className="fig-label">{l}</div>
              </div>
            ))}
          </div>
          <div className="more-link"><Link href="/outlook">Open outlook</Link></div>
        </div>
        <div style={{ flex: "2 1 460px", minWidth: 0 }}>
          <h2 className="sec-title">Around the world</h2>
          <World
            rows={WORLD.map((n) => world.find((w) => w.name === n)).filter((w): w is SeriesRow => !!w)}
            indiaDate={india[0]?.date}
          />
        </div>
      </section>

      <RealityCheck />
    </main>
  );
}

function countsText(setups: { pattern: string }[]) {
  const n = (p: string) => setups.filter((s) => s.pattern === p).length;
  return PATTERN_ORDER.filter((p) => n(p))
    .map((p) => (n(p) === 1 ? `1 ${PATTERN_LABEL[p].toLowerCase()}` : `${n(p)} ${PATTERN_PLURAL[p]}`))
    .join(", ");
}

function Flows({ rows }: { rows: FlowRow[] }) {
  const shown = rows.slice(-5).reverse(); // newest first
  const max = Math.max(1, ...shown.flatMap((r) => [Math.abs(r.fii_net ?? 0), Math.abs(r.dii_net ?? 0)]));
  return (
    <div>
      <h2 className="sec-title">Who bought and sold</h2>
      <p className="sec-sub" style={{ marginBottom: 24 }}>
        Net, ₹ crore, cash market. FII means foreign investors, DII means Indian funds.
        {rows.length < 20 && ` Only ${plural(rows.length, "day")} stored so far.`}
      </p>
      {shown.length === 0 ? (
        <DashedNotice>Fund flows are not available yet.</DashedNotice>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {shown.map((r) => (
            <div key={r.date}>
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>{dayShort(r.date)}</div>
              {(["FII", "DII"] as const).map((who) => {
                const v = who === "FII" ? r.fii_net : r.dii_net;
                return (
                  <div key={who} className="flow-row">
                    <span style={{ fontSize: 14 }}>{who}</span>
                    <Bar value={Math.abs(v ?? 0) / max} tone={toneOf(v) === "down" ? "down" : "up"} size="thick" />
                    <span className={`mono ${toneOf(v)}`} style={{ textAlign: "right", fontSize: 14 }}>
                      {v == null ? "Not available" : signed(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Breadth({ b }: { b: Brief["breadth"] }) {
  const unclear = Math.max(0, b.total - b.trend.up - b.trend.sideways - b.trend.down);
  const seg: [number, string][] = [
    [b.trend.up, "var(--up)"], [b.trend.sideways, "var(--sideways)"], [b.trend.down, "var(--down)"], [unclear, "var(--unclear)"],
  ];
  return (
    <div>
      <h2 className="sec-title">How broad is the market</h2>
      <p className="sec-sub" style={{ marginBottom: 24 }}>Share of the {b.total} tracked stocks that are doing well.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {(
          [
            ["Above 50-day average", b.pct_above_50dma],
            ["Above 200-day average", b.pct_above_200dma],
          ] as const
        ).map(([l, v]) => (
          <div key={l}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
              <span>{l}</span>
              <span className="mono" style={{ fontWeight: 600 }}>{v.toFixed(1)}%</span>
            </div>
            <div style={{ marginTop: 8 }}><Bar value={v / 100} /></div>
          </div>
        ))}
        <div>
          <div style={{ fontSize: 15, marginBottom: 8 }}>Trend</div>
          <div className="stack" role="img" aria-label={`${b.trend.up} up, ${b.trend.sideways} sideways, ${b.trend.down} down, ${unclear} unclear`}>
            {seg.map(([n, c], i) => (n > 0 ? <div key={i} style={{ flex: n, background: c }} /> : null))}
          </div>
          <div className="mono" style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
            <span><span className="up">{b.trend.up}</span> up</span>
            <span><span className="flat">{b.trend.sideways}</span> sideways</span>
            <span><span className="down">{b.trend.down}</span> down</span>
            <span>{unclear} unclear</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sectors({ rows }: { rows: { sector: string; chg: number }[] }) {
  if (!rows.length) return <p className="muted" style={{ margin: 0 }}>No sector rose today.</p>;
  const max = rows[0].chg;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {rows.map((s) => (
        <div key={s.sector} className="sector-row">
          <span title={s.sector} className="ellipsis">{s.sector}</span>
          <Bar value={s.chg / max} tone="up" />
          <span className="mono up" style={{ textAlign: "right" }}>{signed(s.chg)}%</span>
        </div>
      ))}
    </div>
  );
}

function World({ rows, indiaDate }: { rows: SeriesRow[]; indiaDate?: string }) {
  return (
    <div className="lines" style={{ marginTop: 20 }}>
      {rows.map((w) => (
        <div key={w.symbol} className="world-row">
          <span>
            {WORLD_NAME[w.name] ?? w.name}
            {indiaDate && w.date < indiaDate && <span className="muted" style={{ fontSize: 13 }}> · {dayShort(w.date)}</span>}
          </span>
          <span className="mono">{inr(w.close)}</span>
          <ChangeFigure value={change(w.close, w.prev)} className="right" />
        </div>
      ))}
    </div>
  );
}
