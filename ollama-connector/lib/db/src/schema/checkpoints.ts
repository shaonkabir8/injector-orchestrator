import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const checkpointsTable = pgTable("checkpoints", {
  id: serial("id").primaryKey(),
  iteration: integer("iteration").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  fileSizeBytes: integer("file_size_bytes").notNull().default(0),
  notes: text("notes"),
  content: text("content"),
  prompt: text("prompt"),
  model: text("model"),
});

export type Checkpoint = typeof checkpointsTable.$inferSelect;
export type InsertCheckpoint = typeof checkpointsTable.$inferInsert;
