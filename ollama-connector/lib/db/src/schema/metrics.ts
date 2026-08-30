import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";

export const metricsTable = pgTable("metrics", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  iteration: integer("iteration").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  ramPercent: real("ram_percent").notNull().default(0),
  cpuLoad: real("cpu_load").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
});

export type MetricEntry = typeof metricsTable.$inferSelect;
export type InsertMetric = typeof metricsTable.$inferInsert;
