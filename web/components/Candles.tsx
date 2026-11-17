"use client";

import {
  CandlestickSeries, ColorType, HistogramSeries, LineStyle, createChart, createSeriesMarkers,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/db";

export type Marker = { date: string; label: string };
export type Levels = { entry: number; stop: number; target: number };

/** Daily candles + volume. Optional: pattern markers under signal bars, and entry/stop/target lines. */
export default function Candles({
  candles, markers = [], levels,
}: { candles: Candle[]; markers?: Marker[]; levels?: Levels }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const up = v("--up"), down = v("--down"), muted = v("--muted"), line = v("--hair"), volume = v("--volume");

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: muted },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line },
    });

    const price = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false,
    });
    price.setData(candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close })));
    price.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.26 } });

    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(
      candles.map((c) => ({ time: c.date, value: c.volume ?? 0, color: volume }))
    );

    createSeriesMarkers(
      price,
      markers.map((m) => ({ time: m.date, position: "belowBar" as const, shape: "arrowUp" as const, color: v("--amber"), text: m.label }))
    );
    if (levels) {
      const ink = v("--text");
      const line = (p: number, color: string, title: string, style = LineStyle.Dashed) =>
        price.createPriceLine({ price: p, color, title, lineWidth: 1, lineStyle: style, axisLabelVisible: true });
      line(levels.entry, ink, "Entry", LineStyle.Dotted);
      line(levels.stop, down, "Stop");
      line(levels.target, up, "Target");
    }

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, markers, levels]);

  return <div ref={ref} className="chart" role="img" aria-label="Daily candlestick chart with volume" />;
}
