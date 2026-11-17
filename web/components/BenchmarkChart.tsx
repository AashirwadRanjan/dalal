import type { BenchPoint } from "@/lib/db";
import { monthYear, pct } from "@/lib/format";

const W = 1000, H = 200;

/** Equal-weight buy-and-hold index as % change from the start. Its own chart (never a second axis on the R chart). */
export default function BenchmarkChart({ points, from }: { points: BenchPoint[]; from?: string }) {
  const pts = from ? points.filter((p) => p.date >= from) : points;
  if (pts.length < 2) return null;
  const base = pts[0].idx;
  const vals = pts.map((p) => (p.idx / base - 1) * 100);
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const pad = (hi - lo) * 0.08 || 1;
  const y = (v: number) => ((hi + pad - v) / (hi - lo + 2 * pad)) * H;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const last = vals[vals.length - 1];
  const label = `Equal-weight buy and hold of today's ${pts[pts.length - 1].stocks} stocks: ${pct(last, 1)} from ${monthYear(pts[0].date)} to ${monthYear(pts[pts.length - 1].date)}.`;
  return (
    <div className="panel" style={{ padding: "20px 24px 14px" }}>
      <div style={{ position: "relative", paddingRight: 64 }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
          <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <polyline points={vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke="var(--neutral)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="mono" style={{ position: "absolute", right: 0, top: `${(y(last) / H) * 100}%`, transform: "translateY(-50%)", fontSize: 13, color: "var(--text)" }}>{pct(last, 1)}</span>
        <span className="mono" style={{ position: "absolute", right: 0, top: `${(y(0) / H) * 100}%`, transform: "translateY(-50%)", fontSize: 12, color: "var(--muted)" }}>0%</span>
      </div>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", paddingRight: 64, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
        <span>{monthYear(pts[0].date)}</span><span>{monthYear(pts[pts.length - 1].date)}</span>
      </div>
    </div>
  );
}
