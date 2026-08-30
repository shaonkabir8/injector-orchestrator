import { Router, type IRouter } from "express";
import { db, logsTable } from "@workspace/db";
import { GetModelsResponse, PullModelBody, PullModelResponse } from "@workspace/api-zod";
import { listModels, pullModel } from "../lib/ollama-client";

const router: IRouter = Router();

/**
 * GET /api/models
 *
 * Proxies to Ollama's /api/tags endpoint. Returns real model data
 * from the configured Ollama instance. Never uses hardcoded data.
 */
router.get("/models", async (req, res): Promise<void> => {
  try {
    const models = await listModels();
    res.json(GetModelsResponse.parse(models));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to contact model provider";
    await db.insert(logsTable).values({
      level: "ERROR",
      message: `Models fetch failed: ${msg}`,
    });
    res.status(502).json({ error: `Model provider unreachable: ${msg}` });
  }
});

/**
 * POST /api/models/pull
 *
 * Proxies to Ollama's /api/pull endpoint. Pulls a real model from
 * the Ollama registry.
 */
router.post("/models/pull", async (req, res): Promise<void> => {
  const parsed = PullModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name } = parsed.data;
  const result = await pullModel(name);

  await db.insert(logsTable).values({
    level: result.success ? "SUCCESS" : "ERROR",
    message: result.success
      ? `Model operation completed: ${name}`
      : `Model operation failed for ${name}: ${result.message}`,
  });

  res.json(PullModelResponse.parse(result));
});

export default router;
