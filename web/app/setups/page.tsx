import type { Metadata } from "next";
import RealityCheck from "@/components/RealityCheck";
import SetupsTable from "@/components/SetupsTable";
import { DashedNotice, PageHead } from "@/components/ui";
import { getChartPatterns, getSetups, type ChartPattern } from "@/lib/db";
import { dayShort } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Setups" };

export default function SetupsPage() {
  const setups = getSetups();
  const charts: Record<string, ChartPattern[]> = {};
  for (const c of getChartPatterns()) (charts[c.symbol] ??= []).push(c);
  return (
    <main className="wrap">
      <PageHead
        title="Setups today"
        lede={
          <>
            Stocks where a rule fired on the latest close{setups[0] ? ` (${dayShort(setups[0].date)})` : ""}. Use them as a
            watchlist, not as buy signals.
          </>
        }
      />
      <RealityCheck variant="band" />
      <div style={{ height: 32 }} />
      {setups.length ? <SetupsTable setups={setups} charts={charts} /> : <DashedNotice>No setups fired on the latest close.</DashedNotice>}
      {setups.length > 0 && (
        <p className="note"><a href="/api/export/setups" download style={{ fontWeight: 500 }}>Download these setups as CSV</a></p>
      )}
    </main>
  );
}
