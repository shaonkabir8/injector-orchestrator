import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  ollamaUrl: text("ollama_url").notNull().default("http://localhost:11434"),
  defaultModel: text("default_model").notNull().default("qwen2.5:7b"),
  fallbackModel: text("fallback_model").notNull().default("deepseek-r1:8b"),
  maxIterations: integer("max_iterations").notNull().default(50),
  maxRamPercent: integer("max_ram_percent").notNull().default(85),
  gitAutoCommit: boolean("git_auto_commit").notNull().default(true),
  enableNotifications: boolean("enable_notifications").notNull().default(true),
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: text("telegram_chat_id"),
  metricsInterval: integer("metrics_interval").notNull().default(5),
  logLevel: text("log_level").notNull().default("INFO"),
});

export type Settings = typeof settingsTable.$inferSelect;
export type InsertSettings = typeof settingsTable.$inferInsert;
