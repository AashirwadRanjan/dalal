"use client";

import { ColorType, LineSeries, LineStyle, createChart, type ISeriesApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { EquityPoint } from "@/lib/db";
import { PATTERN_LABEL, PATTERN_ORDER, rMult } from "@/lib/format";

// Categorical slots 1-3, fixed order (validated light + dark); see --s1..--s3 in globals.css
const SLOT = ["--s1", "--s2", "--s3"];

/** Cumulative R per pattern over time, one line each, sharing one R axis. */
export default function EquityCurve({ points }: { points: EquityPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ date: string; vals: Record<string, number> } | null>(null);
  const patterns = PATTERN_ORDER.filter((p) => points.some((x) => x.pattern === p));

  // final values: the legend's resting state
  const finals: Record<string, number> = {};
  for (const p of points) finals[p.pattern] = (finals[p.pattern] ?? 0) + p.r;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--muted") },
      grid: { vertLines: { visible: false }, horzLines: { color: v("--line") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderColor: v("--line") },
      crosshair: { horzLine: { visible: false, labelVisible: false } },
      localization: { priceFormatter: (n: number) => rMult(n, 0) },
    });

    const series: Record<string, ISeriesApi<"Line">> = {};
    patterns.forEach((p) => {
      const s = chart.addSeries(LineSeries, {
        color: v(SLOT[PATTERN_ORDER.indexOf(p)]),
        lineWidth: 2,
        title: PATTERN_LABEL[p], // direct label on the axis
        priceLineVisible: false,
        crosshairMarkerRadius: 4,
      });
      let cum = 0;
      s.setData(points.filter((x) => x.pattern === p).map((x) => ({ time: x.date, value: (cum += x.r) })));
      series[p] = s;
    });
    series[patterns[0]]?.createPriceLine({
      price: 0, color: v("--muted"), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false,
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) return setHover(null);
      const vals: Record<string, number> = {};
      for (const p of patterns) {
        const d = param.seriesData.get(series[p]) as { value?: number } | undefined;
        if (d?.value != null) vals[p] = d.value;
      }
      setHover({ date: String(param.time), vals });
    });

    chart.timeScale().fitContent();
    return () => chart.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const shown = hover?.vals ?? finals;
  return (
    <div>
      <div className="legend">
        <span className="muted">{hover ? hover.date : "Total"}</span>
        {patterns.map((p) => (
          <span key={p}>
            <i style={{ background: `var(${SLOT[PATTERN_ORDER.indexOf(p)]})` }} />
            {PATTERN_LABEL[p]} <span className="num">{shown[p] == null ? "–" : rMult(shown[p], 1)}</span>
          </span>
        ))}
      </div>
      <div
        ref={ref}
        className="chart"
        style={{ height: 340 }}
        role="img"
        aria-label="Cumulative backtest result per pattern, in multiples of risk. The table above has the same totals."
      />
    </div>
  );
}
