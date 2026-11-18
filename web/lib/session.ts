import { dayShort } from "./format";

/**
 * Where we are in the trading day, in India time. A setup fires on a close and is acted on at the next open,
 * so after the close today's setups are tomorrow's plan, and during the session they are already in play.
 * NSE holidays are not known here, so "next session" means the next weekday.
 */
const OPEN = 9 * 60 + 15;
const CLOSE = 15 * 60 + 30;
const FINAL = 15 * 60 + 45; // the day's bar from Yahoo is final a little after the close

function istParts(now: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Next weekday after an ISO date. */
export function nextSession(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export type PlanState =
  | { kind: "provisional"; session: string } // fired on today's bar while the market is still open: may vanish
  | { kind: "upcoming"; session: string }  // the next open is still ahead: these setups are the plan for it
  | { kind: "in_play"; session: string }   // that session is trading now: entries happened at its open
  | { kind: "stale"; session: string };    // that session has closed and newer prices haven't been fetched

export function planState(signalDate: string, now = new Date()): PlanState {
  const session = nextSession(signalDate);
  const { date, minutes } = istParts(now);
  if (date === signalDate && minutes < FINAL) return { kind: "provisional", session };
  if (date < session || (date === session && minutes < OPEN)) return { kind: "upcoming", session };
  if (date === session && minutes < CLOSE) return { kind: "in_play", session };
  return { kind: "stale", session };
}


/** Heading and one-line explanation for setups that fired on `signalDate`. */
export function planHeading(signalDate: string, now = new Date()): { title: string; lede: string; state: PlanState } {
  const st = planState(signalDate, now);
  const from = `From the ${dayShort(signalDate)} close.`;
  if (st.kind === "provisional")
    return {
      state: st,
      title: "Forming today, not final",
      lede: `The market is still open, so today's price bar is not final. These setups can appear or vanish by the close; the plan for ${dayShort(st.session)} is set after 3:45 pm.`,
    };
  if (st.kind === "upcoming")
    return {
      state: st,
      title: `Plan for ${dayShort(st.session)}`,
      lede: `${from} Each setup is a plan for the next open (9:15), not a trade at today's price. Use them as a watchlist, not as buy or sell signals.`,
    };
  if (st.kind === "in_play")
    return {
      state: st,
      title: `In play today, ${dayShort(st.session)}`,
      lede: `${from} These were entered or skipped at today's open. Their results arrive with the run after the close; the live record follows each one.`,
    };
  return {
    state: st,
    title: `Setups from ${dayShort(signalDate)}`,
    lede: `${from} The ${dayShort(st.session)} session has already closed and newer prices haven't been fetched. Use Fetch latest for the next plan.`,
  };
}
