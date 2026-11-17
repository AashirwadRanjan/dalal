"use client";

import { useState } from "react";
import type { NewsItem } from "@/lib/db";

const TONES = [
  { id: "all", label: "All" },
  { id: "positive", label: "Positive" },
  { id: "neutral", label: "Neutral" },
  { id: "negative", label: "Negative" },
] as const;
const TAG: Record<string, { kind: string; label: string; shape: string }> = {
  positive: { kind: "t-up", label: "Positive", shape: "6,1 11,10 1,10" },
  neutral: { kind: "t-flat", label: "Neutral", shape: "1,5 11,5 11,7 1,7" },
  negative: { kind: "t-down", label: "Negative", shape: "6,11 11,2 1,2" },
};

/** News list with tone chips. Tone and impact lines come from the LLM step; untagged items say so. */
export default function NewsList({ items }: { items: NewsItem[] }) {
  const [tone, setTone] = useState<string>("all");
  const shown = items.filter((n) => tone === "all" || n.tone === tone);
  return (
    <>
      <div className="chips" role="group" aria-label="Filter news by tone" style={{ marginBottom: 16 }}>
        {TONES.map((t) => (
          <button key={t.id} type="button" className="chip" aria-pressed={tone === t.id} onClick={() => setTone(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="lines">
        {shown.map((n) => {
          const t = n.tone ? TAG[n.tone] : null;
          return (
            <article key={n.url} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 16, padding: "18px 0" }}>
              <div>
                {t ? (
                  <span className={`tag ${t.kind}`}>
                    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" style={{ marginRight: 6 }}>
                      <polygon points={t.shape} fill="currentColor" />
                    </svg>
                    {t.label}
                  </span>
                ) : (
                  <span className="tag t-flat">Not tagged</span>
                )}
              </div>
              <div>
                <a href={n.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)", fontWeight: 600 }}>{n.headline}</a>
                {n.impact && <div style={{ color: "var(--text-2)", marginTop: 4 }}>{n.impact}</div>}
                <div className="mono muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {n.source} · {new Date(n.published_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            </article>
          );
        })}
        {shown.length === 0 && <div style={{ padding: "18px 0" }} className="muted">No news in this group.</div>}
      </div>
    </>
  );
}
