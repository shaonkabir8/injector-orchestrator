import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { GetSettingsResponse, UpdateSettingsBody, UpdateSettingsResponse } from "@workspace/api-zod";
import { getConfiguredBaseUrl, testConnection } from "../lib/ollama-client";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

function toSettingsResponse(settings: Awaited<ReturnType<typeof getOrCreateSettings>>, ollamaUrl: string) {
  return {
    id: settings.id,
    ollamaUrl,
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
  };
}

router.get("/settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetSettingsResponse.parse(toSettingsResponse(settings, await getConfiguredBaseUrl())));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await getOrCreateSettings();
  const [updated] = await db.update(settingsTable).set(parsed.data).returning();
  res.json(UpdateSettingsResponse.parse(toSettingsResponse(updated, await getConfiguredBaseUrl())));
});

router.post("/settings/test-connection", async (req, res): Promise<void> => {
  const requestedUrl = typeof req.body?.ollamaUrl === "string" ? req.body.ollamaUrl : undefined;
  const result = await testConnection(requestedUrl);
  res.json({
    success: result.success,
    reachable: result.reachable,
    ollamaUrl: result.url,
    message: result.message,
    models: result.models,
  });
});

export default router;
