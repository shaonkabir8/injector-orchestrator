import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const logsTable = pgTable("logs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  level: text("level").notNull().default("INFO"),
  message: text("message").notNull(),
});

export type LogEntry = typeof logsTable.$inferSelect;
export type InsertLog = typeof logsTable.$inferInsert;
