import type { Metadata } from "next";
import Link from "next/link";
import BriefLines from "@/components/BriefLines";
import { DashedNotice, PageHead } from "@/components/ui";
import { getBrief, getBriefDates } from "@/lib/db";
import { dayLong, dayShort } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brief archive" };

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const dates = getBriefDates(120);
  const brief = getBrief(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined);
  const i = brief ? dates.indexOf(brief.date) : -1;
  const older = i >= 0 ? dates[i + 1] : undefined;
  const newer = i > 0 ? dates[i - 1] : undefined;

  return (
    <main className="wrap">
      <PageHead
        title="Brief archive"
        lede="Each day’s brief, written from the data after the evening run. Pick a day to read it again."
      />

      <form method="get" action="/brief" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 32 }}>
        <label className="field" style={{ minWidth: 240 }}>
          Day
          <select name="date" defaultValue={brief?.date} className="select" style={{ background: "var(--panel)" }}>
            {dates.map((d) => (
              <option key={d} value={d}>{dayShort(d)} {d.slice(0, 4)}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-outline">Show</button>
        <span style={{ display: "flex", gap: 20, marginLeft: "auto", fontSize: 15 }}>
          {older ? <Link href={`/brief?date=${older}`}>← Earlier day</Link> : <span className="muted">← Earlier day</span>}
          {newer ? <Link href={`/brief?date=${newer}`}>Later day →</Link> : <span className="muted">Later day →</span>}
        </span>
      </form>

      {brief ? (
        <section aria-labelledby="day-h">
          <div style={{ fontSize: 15, color: "var(--muted)", fontWeight: 500 }} id="day-h">{dayLong(brief.date)}</div>
          {brief.hero && <h2 className="sec-title" style={{ fontSize: 30, margin: "8px 0 12px" }}>{brief.hero.headline}</h2>}
          {brief.hero && <p style={{ margin: "0 0 28px", maxWidth: 640, fontSize: 17, color: "var(--text-2)" }}>{brief.hero.text}</p>}
          <BriefLines lines={brief.lines ?? brief.headlines} />
        </section>
      ) : (
        <DashedNotice>{date ? `No brief was written for ${date}.` : "No brief yet. It is written after the first full run."}</DashedNotice>
      )}
    </main>
  );
}
