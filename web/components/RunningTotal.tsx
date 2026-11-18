import type { EquityPoint } from "@/lib/db";
import { LONG_ORDER, PATTERN_COLOR, PATTERN_LABEL, monthYear, rMult, signed } from "@/lib/format";

const W = 1000, H = 340;

/**
 * Running total of R per pattern, from real closed trades in exit-date order. Server-rendered SVG on a
 * shared date axis, dashed zero line, four R ticks. The aria-label gives the totals as text.
 */
export default function RunningTotal({ points }: { points: EquityPoint[] }) {
  const dates = [...new Set(points.map((p) => p.date))].sort();
  if (dates.length < 2) return <p className="muted">Not enough closed trades to draw a running total yet.</p>;
  const xi = new Map(dates.map((d, i) => [d, i]));
  const x = (d: string) => ((xi.get(d) ?? 0) / (dates.length - 1)) * W;

  const series = LONG_ORDER.map((p) => {
    let cum = 0;
    const pts = points.filter((q) => q.pattern === p).map((q) => ({ d: q.date, v: (cum += q.r) }));
    return { p, pts, total: cum };
  }).filter((s) => s.pts.length);

  const all = series.flatMap((s) => s.pts.map((q) => q.v)).concat(0);
  const pad = (Math.max(...all) - Math.min(...all)) * 0.06 || 1;
  const hi = Math.max(...all) + pad, lo = Math.min(...all) - pad;
  const y = (v: number) => ((hi - v) / (hi - lo)) * H;
  const ticks = [0, 1, 2, 3].map((k) => hi - ((hi - lo) * k) / 3);
  const label = `Running total in R for each pattern. ${series
    .map((s) => `${PATTERN_LABEL[s.p]} ends at ${rMult(s.total, 1)}`)
    .join(", ")}.`;

  return (
    <div className="panel" style={{ padding: "24px 24px 18px" }}>
      <div style={{ position: "relative", paddingRight: 64 }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
          {ticks.map((t) => (
            <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--hair)" />
          ))}
          <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 5" />
          {series.map((s) => (
            <polyline
              key={s.p}
              points={`${x(s.pts[0].d).toFixed(1)},${y(0).toFixed(1)} ` + s.pts.map((q) => `${x(q.d).toFixed(1)},${y(q.v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={PATTERN_COLOR[s.p]}
              strokeWidth={2.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {ticks.map((t, k) => (
          <span key={t} className="mono" style={{ position: "absolute", right: 0, width: 58, top: `${(k / 3) * 100}%`, transform: "translateY(-50%)", fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
            {signed(Math.round(t), 0)}R
          </span>
        ))}
      </div>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", paddingRight: 64, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
        <span>{monthYear(dates[0])}</span>
        <span>{monthYear(dates[dates.length - 1])}</span>
      </div>
    </div>
  );
}
