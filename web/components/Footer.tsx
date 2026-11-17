import { getRunStatus } from "@/lib/db";
import { runTime } from "@/lib/format";

/** "Last run …" plus any source that returned nothing, and the advice note on every page. */
export default function Footer() {
  const run = getRunStatus();
  // e.g. market_series detail "15/16 series (no data: Shanghai)" -> "Shanghai returns no data."
  const gaps = run.steps
    .filter((s) => s.step === "market_series")
    .map((s) => /no data: ([^)]+)/.exec(s.detail ?? "")?.[1])
    .filter(Boolean)
    .map((names) => `${names} returns no data.`);

  return (
    <footer className="foot">
      <span className="mono">
        {run.lastRun ? `Last run ${runTime(run.lastRun)}.` : "Not run yet."} {gaps.join(" ")}
      </span>
      <span>Personal research tool. Not investment advice.</span>
    </footer>
  );
}
