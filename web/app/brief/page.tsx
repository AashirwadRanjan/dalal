import Link from "next/link";
import BriefView from "@/components/BriefView";
import Nav from "@/components/Nav";
import { getBrief, getBriefDates } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const brief = getBrief(date);
  const dates = getBriefDates();

  return (
    <main className="wrap">
      <Nav />
      <h1 className="pagetitle">Daily brief{brief ? ` · ${brief.date}` : ""}</h1>
      <p className="lede">
        Written automatically after each data fetch, from the numbers on the dashboard. A new one appears every
        trading day after the 6:45 pm run.
      </p>
      {brief ? (
        <BriefView brief={brief} full />
      ) : (
        <div className="empty"><p>No brief {date ? `for ${date}` : "yet"}. Click <strong>Fetch latest</strong> on the dashboard to build one.</p></div>
      )}
      {dates.length > 1 && (
        <p className="sub" style={{ marginTop: 28 }}>
          Earlier briefs:{" "}
          {dates.map((d, i) => (
            <span key={d}>
              {i > 0 && " · "}
              {d === brief?.date ? <strong>{d}</strong> : <Link href={`/brief?date=${d}`}>{d}</Link>}
            </span>
          ))}
        </p>
      )}
    </main>
  );
}
