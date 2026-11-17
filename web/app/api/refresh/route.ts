import { spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "..");
const PYTHON = process.env.PYTHON ?? path.join(ROOT, ".venv", "bin", "python");

// One run at a time; a second click joins the run already in flight.
let running: Promise<{ ok: boolean; output: string }> | null = null;

function runEngine() {
  return new Promise<{ ok: boolean; output: string }>((resolve) => {
    const child = spawn(PYTHON, ["-m", "engine.run_daily"], { cwd: ROOT });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", (e) => resolve({ ok: false, output: `Could not start ${PYTHON}: ${e.message}` }));
    child.on("close", (code) => resolve({ ok: code === 0, output }));
  });
}

export async function POST() {
  running ??= runEngine().finally(() => (running = null));
  const { ok, output } = await running;
  // keep the step summary lines, drop yfinance noise
  const summary = output.split("\n").filter((l) => /^\[\w+\] (ok|FAILED)|Could not start/.test(l));
  return Response.json({ ok, summary }, { status: ok ? 200 : 500 });
}
