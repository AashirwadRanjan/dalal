/**
 * Small presentational pieces from the design spec. Server-safe (no hooks), so any page can use them.
 * Rule: a word always travels with colour (tags, arrows, signs), never colour alone.
 */
import type { ReactNode } from "react";
import { TREND_LABEL, pct, toneOf, type Tone } from "@/lib/format";

/* ---------- tags ---------- */

type TagKind = "up" | "flat" | "down" | "amber";

export function Tag({ kind, strong, children }: { kind: TagKind; strong?: boolean; children: ReactNode }) {
  return <span className={`tag t-${kind}${strong ? " tag-strong" : ""}`}>{children}</span>;
}

/** Technical read: Supports / Neutral / Warns */
export type Read = "supports" | "neutral" | "warns";
export const ReadTag = ({ read }: { read: Read }) =>
  read === "supports" ? <Tag kind="up">Supports</Tag> : read === "warns" ? <Tag kind="down">Warns</Tag> : <Tag kind="flat">Neutral</Tag>;

/** Rule output: Add / Hold / Review / Exit */
export type Action = "Add" | "Hold" | "Review" | "Exit";
const ACTION_KIND: Record<Action, TagKind> = { Add: "up", Hold: "flat", Review: "amber", Exit: "down" };
export const ActionTag = ({ action }: { action: Action }) => (
  <Tag kind={ACTION_KIND[action]} strong>
    {action}
  </Tag>
);

/** Short direction label for brief lines: UP / FLAT / DOWN (the only all-caps text allowed) */
export const DirTag = ({ tone }: { tone: Tone }) => (
  <span className={`dir ${tone}`}>{tone === "up" ? "UP" : tone === "down" ? "DOWN" : "FLAT"}</span>
);

/* ---------- figures ---------- */

/** "▲ +0.38%" / "▼ −2.49%" / "–": arrow, sign and colour together. `value` is a percent (already ×100). */
export function ChangeFigure({ value, digits = 2, className = "" }: { value: number | null | undefined; digits?: number; className?: string }) {
  const t = toneOf(value);
  if (value == null) return <span className={`mono muted ${className}`}>–</span>;
  const arrow = t === "up" ? "▲ " : t === "down" ? "▼ " : "";
  return (
    <span className={`mono ${t === "flat" ? "muted" : t} ${className}`}>
      {arrow}
      {pct(value, digits)}
    </span>
  );
}

/** Coloured dot plus trend word */
export function Trend({ trend }: { trend: string | null | undefined }) {
  const t = trend ?? "unknown";
  const cls = t === "up" ? "ok" : t === "down" ? "bad" : "flat";
  return (
    <span className="trend">
      <span className={`dot ${cls}`} aria-hidden="true" />
      {TREND_LABEL[t] ?? t}
    </span>
  );
}

/* ---------- bars ---------- */

/** Horizontal bar. `value` 0..1 of the track. Colour by tone or amber (default). Always pair with a visible number. */
export function Bar({
  value, tone, size, label,
}: { value: number; tone?: Tone | "amber"; size?: "thin" | "thick"; label?: string }) {
  const w = `${Math.max(0, Math.min(1, value)) * 100}%`;
  const cls = tone && tone !== "amber" ? tone : "";
  return (
    <div className={`bar${size ? ` ${size}` : ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className={cls} style={{ width: w, minWidth: value > 0 ? 6 : 0 }} />
    </div>
  );
}

/* ---------- panels ---------- */

export function Panel({ children, pad, className = "", ...rest }: { children: ReactNode; pad?: boolean; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`panel${pad ? " panel-pad" : ""} ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** Scrollable table container: the panel scrolls sideways on narrow screens, never the page. */
export function TablePanel({ children, minWidth, label }: { children: ReactNode; minWidth: number; label?: string }) {
  return (
    <div className="panel tbl-wrap" role={label ? "region" : undefined} aria-label={label} tabIndex={label ? 0 : undefined}>
      <div className="tbl-pad" style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}

/** Verdict card: dot + one-line verdict + one plain sentence. */
export function VerdictCard({
  tone, title, children, extra,
}: { tone: Tone | "amber"; title: string; children?: ReactNode; extra?: ReactNode }) {
  const dot = tone === "up" ? "ok" : tone === "down" ? "bad" : tone === "amber" ? "amber" : "flat";
  return (
    <div>
      <div className="verdict-head">
        <span className={`dot ${dot}`} aria-hidden="true" style={dot === "amber" ? { background: "var(--amber)" } : undefined} />
        <span className="verdict-title">{title}</span>
      </div>
      {children && <p className="verdict-text">{children}</p>}
      {extra}
    </div>
  );
}

/** "Not built yet" / "Not available yet": dashed border, plain words. */
export function DashedNotice({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="dashed">
      {title && <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{title}</h3>}
      <div>{children}</div>
    </div>
  );
}

export function SectionHead({ title, sub, right, id }: { title: string; sub?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <>
      <div className="sec-head">
        <h2 className="sec-title" id={id}>{title}</h2>
        {right}
      </div>
      {sub ? <p className="sec-sub">{sub}</p> : <div style={{ height: 20 }} />}
    </>
  );
}

export function PageHead({ title, lede, aside }: { title: string; lede?: ReactNode; aside?: ReactNode }) {
  return (
    <section className="page-head" style={aside ? { display: "flex", flexWrap: "wrap", gap: "20px 56px", alignItems: "flex-end", justifyContent: "space-between" } : undefined}>
      <div style={aside ? { flex: "1 1 420px" } : undefined}>
        <h1 className="page-title">{title}</h1>
        {lede && <p className="page-lede">{lede}</p>}
      </div>
      {aside}
    </section>
  );
}
