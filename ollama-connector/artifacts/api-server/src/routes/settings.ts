import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { GetSettingsResponse, UpdateSettingsBody, UpdateSettingsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

router.get("/settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetSettingsResponse.parse({
    id: settings.id,
    ollamaUrl: settings.ollamaUrl,
    defaultModel: settings.defaultModel,
    fallbackModel: settings.fallbackModel,
    maxIterations: settings.maxIterations,
    maxRamPercent: settings.maxRamPercent,
    gitAutoCommit: settings.gitAutoCommit,
    enableNotifications: settings.enableNotifications,
    telegramBotToken: settings.telegramBotToken ?? null,
    telegramChatId: settings.telegramChatId ?? null,
    metricsInterval: settings.metricsInterval,
    logLevel: settings.logLevel,
  }));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await getOrCreateSettings();
  const [updated] = await db.update(settingsTable).set(parsed.data).returning();

  res.json(UpdateSettingsResponse.parse({
    id: updated.id,
    ollamaUrl: updated.ollamaUrl,
    defaultModel: updated.defaultModel,
    fallbackModel: updated.fallbackModel,
    maxIterations: updated.maxIterations,
    maxRamPercent: updated.maxRamPercent,
    gitAutoCommit: updated.gitAutoCommit,
    enableNotifications: updated.enableNotifications,
    telegramBotToken: updated.telegramBotToken ?? null,
    telegramChatId: updated.telegramChatId ?? null,
    metricsInterval: updated.metricsInterval,
    logLevel: updated.logLevel,
  }));
});

/**
 * POST /api/settings/test-connection
 *
 * Pings the configured (or provided) Ollama URL's /api/tags endpoint
 * and returns reachability + model list. Useful for validating
 * connection config before saving.
 */
router.post("/settings/test-connection", async (req, res): Promise<void> => {
  const testUrl: string | undefined = req.body?.ollamaUrl;
  const baseUrl = testUrl || (await getOrCreateSettings()).ollamaUrl;
  const normalizedUrl = baseUrl.replace(/\/+$/, "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${normalizedUrl}/api/tags`, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      res.json({
        success: false,
        reachable: true,
        ollamaUrl: normalizedUrl,
        message: `Ollama returned HTTP ${response.status}`,
        models: [],
      });
      return;
    }

    const data = (await response.json()) as { models?: Array<{ name: string; size: number; modified_at: string; digest: string }> };
    const models = (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
      digest: m.digest,
    }));

    res.json({
      success: true,
      reachable: true,
      ollamaUrl: normalizedUrl,
      message: `Connected — ${models.length} model${models.length !== 1 ? "s" : ""} found`,
      models,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.json({
      success: false,
      reachable: false,
      ollamaUrl: normalizedUrl,
      message: msg,
      models: [],
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
