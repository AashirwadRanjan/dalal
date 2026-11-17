import type { FlowRow } from "@/lib/db";

/** Daily FII and DII net flow (Rs crore). Server-rendered SVG, no chart library. */
export default function FlowBars({ rows }: { rows: FlowRow[] }) {
  const W = 640, H = 210, padX = 6, padT = 8, padB = 24;
  const half = (H - padT - padB) / 2;
  const mid = padT + half;
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.fii_net ?? 0), Math.abs(r.dii_net ?? 0)]));
  const slot = (W - padX * 2) / rows.length;
  const bw = Math.max(2, slot * 0.38);

  const bar = (v: number | null, x: number, fill: string, key: string) => {
    if (v == null) return null;
    const h = (Math.abs(v) / max) * half;
    return <rect key={key} x={x} y={v >= 0 ? mid - h : mid} width={bw} height={Math.max(h, 0.5)} fill={fill} rx={1} />;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`FII and DII net flows over the last ${rows.length} trading days`}
    >
      <line x1={padX} x2={W - padX} y1={mid} y2={mid} stroke="var(--line)" />
      {rows.map((r, i) => {
        const cx = padX + i * slot + slot / 2;
        return (
          <g key={r.date}>
            <title>{`${r.date}  FII ${Math.round(r.fii_net ?? 0)} Cr, DII ${Math.round(r.dii_net ?? 0)} Cr`}</title>
            {bar(r.fii_net, cx - bw - 0.5, "var(--link)", "f")}
            {bar(r.dii_net, cx + 0.5, "var(--dii)", "d")}
          </g>
        );
      })}
      <text x={padX} y={H - 6} fontSize="11" fill="var(--muted)">{rows[0]?.date}</text>
      <text x={W - padX} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{rows[rows.length - 1]?.date}</text>
    </svg>
  );
}
