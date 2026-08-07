import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, logsTable } from "@workspace/db";
import { GetLogsResponse, GetLogsQueryParams, ClearLogsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/logs", async (req, res): Promise<void> => {
  const params = GetLogsQueryParams.safeParse(req.query);
  const limit = params.success && params.data.limit ? params.data.limit : 200;
  const level = params.success ? params.data.level : undefined;

  let query = db.select().from(logsTable).orderBy(desc(logsTable.timestamp));

  const rows = await query.limit(limit);

  const filtered = level
    ? rows.filter((r) => r.level === level)
    : rows;

  res.json(GetLogsResponse.parse(
    filtered.reverse().map((r) => ({
      id: r.id,
      timestamp: r.timestamp.toISOString(),
      level: r.level,
      message: r.message,
    }))
  ));
});

router.delete("/logs", async (req, res): Promise<void> => {
  await db.delete(logsTable);
  res.json(ClearLogsResponse.parse({ deleted: true }));
});

export default router;
