import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const loopStateTable = pgTable("loop_state", {
  id: serial("id").primaryKey(),
  running: boolean("running").notNull().default(false),
  iteration: integer("iteration").notNull().default(0),
  state: text("state").notNull().default("idle"),
  currentModel: text("current_model"),
  startedAt: timestamp("started_at"),
  lastIterationAt: timestamp("last_iteration_at"),
  prompt: text("prompt"),
  maxIterations: integer("max_iterations").notNull().default(50),
});

export type LoopState = typeof loopStateTable.$inferSelect;
export type InsertLoopState = typeof loopStateTable.$inferInsert;
