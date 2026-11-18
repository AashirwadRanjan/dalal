"use client";

import {
  CandlestickSeries, ColorType, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/db";

type Frame = "D" | "W" | "M";
type Levels = { entry: number; stop: number; target: number };
type Bar = { date: string; open: number; high: number; low: number; close: number; volume: number };

const FRAMES: { id: Frame; label: string; unit: string; show: number }[] = [
  { id: "D", label: "Daily", unit: "trading day", show: 130 },
  { id: "W", label: "Weekly", unit: "week", show: 104 },
  { id: "M", label: "Monthly", unit: "month", show: 60 },
];

/** Group daily candles into weeks (Monday start) or calendar months. Each bar is dated by its first trading day. */
export function resample(c: Candle[], f: Frame): Bar[] {
  const toBar = (x: Candle): Bar => ({ date: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume ?? 0 });
  if (f === "D") return c.map(toBar);
  const key = (iso: string) => {
    if (f === "M") return iso.slice(0, 7);
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
    return d.toISOString().slice(0, 10);
  };
  const out: Bar[] = [];
  let k = "";
  for (const x of c) {
    const kk = key(x.date);
    const b = out[out.length - 1];
    if (kk !== k || !b) {
      out.push(toBar(x));
      k = kk;
    } else {
      b.high = Math.max(b.high, x.high);
      b.low = Math.min(b.low, x.low);
      b.close = x.close;
      b.volume += x.volume ?? 0;
    }
  }
  return out;
}

const NO_MARKERS: { date: string; label: string }[] = [];

const sma = (bars: Bar[], n: number) =>
  bars.map((_, i) => (i < n - 1 ? null : bars.slice(i - n + 1, i + 1).reduce((a, b) => a + b.close, 0) / n));

export default function StockChart({
  candles, levels, markers = NO_MARKERS,
}: { candles: Candle[]; levels?: Levels; markers?: { date: string; label: string; side?: "long" | "short" }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame>("D");
  const cfg = FRAMES.find((f) => f.id === frame)!;
  const bars = useMemo(() => resample(candles, frame), [candles, frame]);
  const s50 = useMemo(() => sma(bars, 50), [bars]);
  const s200 = useMemo(() => sma(bars, 200), [bars]);
  const has50 = s50.some((v) => v != null), has200 = s200.some((v) => v != null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !bars.length) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--muted"), fontFamily: "IBM Plex Mono, monospace" },
      grid: { vertLines: { visible: false }, horzLines: { color: v("--hair") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderColor: v("--hair") },
    });
    const price = chart.addSeries(CandlestickSeries, {
      upColor: v("--up"), downColor: v("--down"), wickUpColor: v("--up"), wickDownColor: v("--down"), borderVisible: false,
      priceLineVisible: false,
      // keep entry, stop and target on screen even when price hasn't reached them
      autoscaleInfoProvider: (orig: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = orig();
        if (!r || !levels) return r;
        return { ...r, priceRange: {
          minValue: Math.min(r.priceRange.minValue, levels.stop),
          maxValue: Math.max(r.priceRange.maxValue, levels.target),
        } };
      },
    });
    price.setData(bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })));
    price.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.2 } });

    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", color: v("--volume"), lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vol.setData(bars.map((b) => ({ time: b.date, value: b.volume })));

    const line = (vals: (number | null)[], color: string) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(vals.flatMap((val, i) => (val == null ? [] : [{ time: bars[i].date, value: val }])));
    };
    if (has200) line(s200, v("--sky"));
    if (has50) line(s50, v("--amber"));

    if (levels) {
      const pl = (p: number, color: string, title: string) =>
        price.createPriceLine({ price: p, color, title, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true });
      pl(levels.target, v("--up"), "Target");
      pl(levels.entry, v("--up"), "Entry");
      pl(levels.stop, v("--down"), "Stop");
    }
    if (frame === "D" && markers.length) {
      createSeriesMarkers(
        price,
        markers.map((m) =>
          m.side === "short"
            ? { time: m.date, position: "aboveBar" as const, shape: "arrowDown" as const, color: v("--down"), text: m.label }
            : { time: m.date, position: "belowBar" as const, shape: "arrowUp" as const, color: v("--amber"), text: m.label }
        )
      );
    }
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - cfg.show), to: bars.length + 2 });
    return () => chart.remove();
  }, [bars, s50, s200, has50, has200, levels, markers, frame, cfg.show]);

  const last = bars[bars.length - 1];
  const summary = last
    ? `${cfg.label} candlestick chart, ${bars.length} bars. Latest close ${last.close.toFixed(2)}. ` +
      `50-bar average ${has50 ? (s50[s50.length - 1] ?? 0).toFixed(2) : "not available, fewer than 50 bars"}. ` +
      `200-bar average ${has200 ? (s200[s200.length - 1] ?? 0).toFixed(2) : "not available, fewer than 200 bars"}.` +
      (levels ? ` Trade entry ${levels.entry.toFixed(2)}, stop ${levels.stop.toFixed(2)}, target ${levels.target.toFixed(2)}.` : "")
    : "No price history.";

  return (
    <section style={{ paddingTop: 56 }} aria-labelledby="chart-h">
      <div className="sec-head" style={{ alignItems: "center" }}>
        <h2 className="sec-title" id="chart-h">Price chart</h2>
        <div className="chips" role="group" aria-label="Chart timeframe">
          {FRAMES.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={frame === f.id} onClick={() => setFrame(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-key" style={{ margin: "16px 0" }} aria-hidden="true">
        <span><i style={{ background: "var(--amber)" }} />50-bar average{has50 ? "" : " (not enough bars)"}</span>
        <span><i style={{ background: "var(--sky)" }} />200-bar average{has200 ? "" : " (not enough bars)"}</span>
        {levels && (
          <>
            <span><i style={{ background: "repeating-linear-gradient(90deg, var(--up) 0 5px, transparent 5px 8px)" }} />Entry and target</span>
            <span><i style={{ background: "repeating-linear-gradient(90deg, var(--down) 0 5px, transparent 5px 8px)" }} />Stop</span>
          </>
        )}
      </div>
      <div className="panel" style={{ padding: "16px 8px 8px 16px" }}>
        <div ref={ref} className="chart-box" role="img" aria-label={summary} />
      </div>
      <p className="note" style={{ fontSize: 13 }}>
        Each bar is one {cfg.unit}. Grey bars at the bottom show shares traded. Prices are end of day and go back to{" "}
        {candles[0]?.date ?? "–"}, so weekly and monthly charts show fewer bars.
      </p>
      <p className="sr-only">{summary}</p>
    </section>
  );
}
