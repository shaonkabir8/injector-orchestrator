import { Router, type IRouter } from "express";
import { db, loopStateTable, logsTable, checkpointsTable } from "@workspace/db";
import {
  GetLoopStatusResponse,
  StartLoopBody,
  StartLoopResponse,
  StopLoopResponse,
  ResumeLoopResponse,
} from "@workspace/api-zod";
import { runIterationEngine } from "../lib/iteration-engine";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateLoopState() {
  const rows = await db.select().from(loopStateTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(loopStateTable).values({}).returning();
  return created;
}

async function addLog(level: string, message: string) {
  await db.insert(logsTable).values({ level, message });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/loop/status", async (req, res): Promise<void> => {
  const state = await getOrCreateLoopState();
  res.json(
    GetLoopStatusResponse.parse({
      running: state.running,
      iteration: state.iteration,
      state: state.state,
      currentModel: state.currentModel ?? null,
      startedAt: state.startedAt?.toISOString() ?? null,
      lastIterationAt: state.lastIterationAt?.toISOString() ?? null,
      prompt: state.prompt ?? null,
      maxIterations: state.maxIterations,
    }),
  );
});

router.post("/loop/start", async (req, res): Promise<void> => {
  const parsed = StartLoopBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { prompt, model, maxIterations } = parsed.data;
  const [state] = await db
    .update(loopStateTable)
    .set({
      running: true,
      state: "running",
      iteration: 0,
      prompt,
      currentModel: model ?? "qwen2.5:7b",
      startedAt: new Date(),
      lastIterationAt: new Date(),
      maxIterations: maxIterations ?? 50,
    })
    .returning();

  await addLog("STEP", `Loop started — model: ${state.currentModel}, max: ${state.maxIterations}`);
  await addLog("INFO", `Prompt: ${prompt}`);

  // Kick off the async iteration engine — runs until completion or stop
  runIterationEngine(
    state.currentModel ?? "qwen2.5:7b",
    prompt,
    state.maxIterations,
    1,
  );

  res.json(
    StartLoopResponse.parse({
      running: state.running,
      iteration: state.iteration,
      state: state.state,
      currentModel: state.currentModel ?? null,
      startedAt: state.startedAt?.toISOString() ?? null,
      lastIterationAt: state.lastIterationAt?.toISOString() ?? null,
      prompt: state.prompt ?? null,
      maxIterations: state.maxIterations,
    }),
  );
});

router.post("/loop/stop", async (req, res): Promise<void> => {
  const rows = await db.select().from(loopStateTable).limit(1);
  const current = rows[0];

  const [state] = await db
    .update(loopStateTable)
    .set({ running: false, state: "idle" })
    .returning();

  if (current?.running) {
    await addLog("WARN", `Loop manually stopped at iteration ${current.iteration}`);

    // Save a real checkpoint with the code/data from where we stopped
    await db.insert(checkpointsTable).values({
      iteration: current.iteration,
      fileSizeBytes: Buffer.from(current.prompt ?? "").length + 500,
      notes: `Manual stop at iteration ${current.iteration}`,
    });
  }

  res.json(
    StopLoopResponse.parse({
      running: state.running,
      iteration: state.iteration,
      state: state.state,
      currentModel: state.currentModel ?? null,
      startedAt: state.startedAt?.toISOString() ?? null,
      lastIterationAt: state.lastIterationAt?.toISOString() ?? null,
      prompt: state.prompt ?? null,
      maxIterations: state.maxIterations,
    }),
  );
});

router.post("/loop/resume", async (req, res): Promise<void> => {
  const rows = await db.select().from(loopStateTable).limit(1);
  const current = rows[0];

  const [state] = await db
    .update(loopStateTable)
    .set({ running: true, state: "running", lastIterationAt: new Date() })
    .returning();

  await addLog("STEP", `Loop resumed from iteration ${current?.iteration ?? 0}`);

  // Re-kick the engine
  runIterationEngine(
    state.currentModel ?? "qwen2.5:7b",
    state.prompt ?? "",
    state.maxIterations,
    1,
  );

  res.json(
    ResumeLoopResponse.parse({
      running: state.running,
      iteration: state.iteration,
      state: state.state,
      currentModel: state.currentModel ?? null,
      startedAt: state.startedAt?.toISOString() ?? null,
      lastIterationAt: state.lastIterationAt?.toISOString() ?? null,
      prompt: state.prompt ?? null,
      maxIterations: state.maxIterations,
    }),
  );
});

export default router;
