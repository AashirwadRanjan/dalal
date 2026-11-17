import Link from "next/link";
import { getInstruments, getRunStatus } from "@/lib/db";
import { dayMonth, dayShort } from "@/lib/format";
import { listJoin, stepName } from "@/lib/steps";
import FetchButton from "./FetchButton";
import NavLinks from "./NavLinks";
import SearchBox from "./SearchBox";

/** Wordmark, five nav items, search; then the status line with "Fetch latest". On every page. */
export default function AppHeader() {
  const instruments = getInstruments();
  return (
    <>
      <header className="hdr">
        <div className="wrap hdr-in">
          <Link href="/" className="wordmark" aria-label="Dalal, today">
            Dalal<span>.</span>
          </Link>
          <NavLinks />
          <SearchBox items={instruments} />
        </div>
      </header>
      <div className="wrap">
        <StatusLine />
      </div>
    </>
  );
}

export function StatusLine() {
  const run = getRunStatus();
  const failed = run.steps.filter((s) => s.status === "failed");
  let text: string;
  if (!run.steps.length) text = "No data yet. Fetch latest builds the database (first run takes a few minutes).";
  else if (failed.length)
    text = `${listJoin(failed.map((s) => stepName(s.step)))} failed on ${dayMonth(failed[0].ran_at)}. See data health.`;
  else text = `Prices as of ${dayShort(run.latestPriceDate)}. All ${run.steps.length} steps ok.`;

  return (
    <div className="status mono">
      <span className="msg">
        <span className={`dot ${!run.steps.length ? "flat" : failed.length ? "bad" : "ok"}`} aria-hidden="true" />
        <Link href="/health" className={failed.length ? "down" : undefined}>{text}</Link>
      </span>
      <FetchButton />
    </div>
  );
}
