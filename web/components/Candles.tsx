"use client";

import { CandlestickSeries, ColorType, HistogramSeries, createChart } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/db";

export default function Candles({ candles }: { candles: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const up = v("--up"), down = v("--down"), muted = v("--muted"), line = v("--line");

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
      candles.map((c) => ({ time: c.date, value: c.volume ?? 0, color: c.close >= c.open ? up + "88" : down + "88" }))
    );

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles]);

  return <div ref={ref} className="chart" role="img" aria-label="Daily candlestick chart with volume" />;
}
