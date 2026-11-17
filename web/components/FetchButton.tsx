"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** "Fetch latest": runs the engine through POST /api/refresh, then re-renders every server component. */
export default function FetchButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; summary: string[] };
      const failed = body.summary.filter((l) => !/\] ok:/.test(l));
      setMsg(body.ok ? { ok: true, text: "Updated." } : { ok: false, text: failed[0] ?? "Failed. See data health." });
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg({ ok: false, text: `Failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <span role="status" className={msg ? (msg.ok ? "up" : "down") : undefined}>
        {busy ? "Fetching, about 20 seconds…" : msg?.text}
      </span>
      <button type="button" className={`btn btn-outline${size === "sm" ? " btn-sm" : ""}`} onClick={run} disabled={busy}>
        {busy ? "Fetching…" : "Fetch latest"}
      </button>
    </span>
  );
}
