import { spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "..");
const PYTHON = process.env.PYTHON ?? path.join(ROOT, ".venv", "bin", "python");
const COOLDOWN_MS = 60_000; // a full run takes ~20 s; no point re-running sooner

type Result = { ok: boolean; summary: string[] };

// One run at a time; a second click joins the run already in flight.
let running: Promise<Result> | null = null;
let lastFinished = 0;
let lastResult: Result | null = null;

function runEngine() {
  return new Promise<Result>((resolve) => {
    // The engine lives outside web/; tell Turbopack not to trace the whole repo into the server bundle.
    const child = spawn(/*turbopackIgnore: true*/ PYTHON, ["-m", "engine.run_daily"], { cwd: ROOT });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", () => resolve({ ok: false, summary: ["Could not start the engine. Check that .venv exists."] }));
    child.on("close", (code) => {
      // Only the per-step summary lines leave the server; tracebacks stay in the server log.
      const summary = output.split("\n").filter((l) => /^\[\w+\] (ok|FAILED)/.test(l));
      if (code !== 0) console.error(output);
      resolve({ ok: code === 0, summary });
    });
  });
}

/** Same-origin only: the button on our own pages. Blocks other sites posting here from a browser. */
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ ok: false, summary: ["Refused: request did not come from this app."] }, { status: 403 });

  if (!running && lastResult && Date.now() - lastFinished < COOLDOWN_MS) {
    return Response.json({ ...lastResult, cached: true }, { status: lastResult.ok ? 200 : 500 });
  }
  running ??= runEngine().then((r) => {
    lastFinished = Date.now();
    lastResult = r;
    running = null;
    return r;
  });
  const result = await running;
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
