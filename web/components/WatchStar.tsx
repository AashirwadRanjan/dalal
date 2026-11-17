"use client";

import { useFormStatus } from "react-dom";
import { toggleWatch } from "@/app/stock/[symbol]/actions";

function Star({ watched }: { watched: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-outline" aria-pressed={watched} disabled={pending}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill={watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
        <path d="m8 1.8 1.9 4 4.3.5-3.2 2.9.9 4.3L8 11.4l-3.9 2.1.9-4.3L1.8 6.3l4.3-.5z" />
      </svg>
      {watched ? "On your watchlist" : "Add to watchlist"}
    </button>
  );
}

/** Watchlist toggle; works without JavaScript too (plain form post to a server action). */
export default function WatchStar({ symbol, watched }: { symbol: string; watched: boolean }) {
  return (
    <form action={toggleWatch}>
      <input type="hidden" name="symbol" value={symbol} />
      <input type="hidden" name="on" value={watched ? "0" : "1"} />
      <Star watched={watched} />
    </form>
  );
}
