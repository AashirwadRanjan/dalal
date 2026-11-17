"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; summary: string[] };
      setMsg(body.ok ? "Updated" : `Failed: ${body.summary.filter((l) => !l.includes(" ok:")).join("; ") || "see server log"}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="refresh">
      {msg && <span className={msg === "Updated" ? "muted" : "warn"}>{msg}</span>}
      <button onClick={refresh} disabled={busy}>
        {busy ? "Fetching…" : "Fetch latest"}
      </button>
    </span>
  );
}
