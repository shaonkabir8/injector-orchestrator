import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, checkpointsTable, loopStateTable, logsTable } from "@workspace/db";
import {
  GetCheckpointsResponse,
  DeleteCheckpointParams,
  DeleteCheckpointResponse,
} from "@workspace/api-zod";
import { runIterationEngine } from "../lib/iteration-engine";

const router: IRouter = Router();

router.get("/checkpoints", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(checkpointsTable)
    .orderBy(desc(checkpointsTable.createdAt));

  res.json(GetCheckpointsResponse.parse(
    rows.map((r) => ({
      id: r.id,
      iteration: r.iteration,
      createdAt: r.createdAt.toISOString(),
      fileSizeBytes: r.fileSizeBytes,
      notes: r.notes ?? null,
      content: r.content ?? null,
      prompt: r.prompt ?? null,
      model: r.model ?? null,
    }))
  ));
});

/**
 * POST /api/checkpoints/:id/restore
 *
 * Restores the loop state from a specific checkpoint:
 * 1. Loads the checkpoint's stored prompt, model, and iteration
 * 2. Updates loop state in the database
 * 3. Kicks off the iteration engine from that iteration
 * 4. Logs the restore event
 */
router.post("/checkpoints/:id/restore", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const cpId = parseInt(raw, 10);
  if (isNaN(cpId)) {
    res.status(400).json({ error: "Invalid checkpoint ID" });
    return;
  }

  const [checkpoint] = await db
    .select()
    .from(checkpointsTable)
    .where(eq(checkpointsTable.id, cpId));

  if (!checkpoint) {
    res.status(404).json({ error: "Checkpoint not found" });
    return;
  }

  const model = checkpoint.model ?? "qwen2.5:7b";
  const prompt = checkpoint.prompt ?? "";
  const iteration = checkpoint.iteration;
  const maxIterations = 50;

  if (!prompt) {
    res.status(400).json({ error: "Checkpoint has no stored prompt — cannot restore" });
    return;
  }

  // Update loop state to the checkpoint's iteration
  await db
    .update(loopStateTable)
    .set({
      running: true,
      state: "running",
      iteration,
      prompt,
      currentModel: model,
      startedAt: new Date(),
      lastIterationAt: new Date(),
      maxIterations,
    });

  await db.insert(logsTable).values({
    level: "STEP",
    message: `Checkpoint #${cpId} restored — resuming at iteration ${iteration} with model ${model}`,
  });

  // Kick off the iteration engine from this checkpoint's iteration
  runIterationEngine(model, prompt, maxIterations, iteration);

  res.json({
    checkpointId: cpId,
    iteration,
    model,
    prompt,
    state: "running",
  });
});

router.delete("/checkpoints/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteCheckpointParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(checkpointsTable)
    .where(eq(checkpointsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Checkpoint not found" });
    return;
  }

  res.json(DeleteCheckpointResponse.parse({ deleted: true }));
});

export default router;
