import { Router, type IRouter } from "express";
import { desc, sum, avg, max, count } from "drizzle-orm";
import { db, metricsTable, logsTable } from "@workspace/db";
import {
  GetMetricsResponse,
  GetMetricsQueryParams,
  GetMetricsSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * GET /api/metrics
 *
 * Returns real metrics from the database, ordered chronologically.
 * No mock data — every row was written by a real loop iteration.
 */
router.get("/metrics", async (req, res): Promise<void> => {
  const params = GetMetricsQueryParams.safeParse(req.query);
  const limit = params.success && params.data.limit ? params.data.limit : 100;

  const rows = await db
    .select()
    .from(metricsTable)
    .orderBy(desc(metricsTable.timestamp))
    .limit(limit);

  res.json(
    GetMetricsResponse.parse(
      rows.reverse().map((r) => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        iteration: r.iteration,
        totalTokens: r.totalTokens,
        ramPercent: r.ramPercent,
        cpuLoad: r.cpuLoad,
        latencyMs: r.latencyMs,
      })),
    ),
  );
});

/**
 * GET /api/metrics/summary
 *
 * Aggregated metrics for the dashboard. Success rate is calculated
 * from the ratio of SUCCESS vs ERROR log entries, not hardcoded.
 */
router.get("/metrics/summary", async (req, res): Promise<void> => {
  const rows = await db.select().from(metricsTable);

  if (rows.length === 0) {
    res.json(
      GetMetricsSummaryResponse.parse({
        totalIterations: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        avgRamPercent: 0,
        avgCpuLoad: 0,
        avgLatencyMs: 0,
        peakRamPercent: 0,
        successRate: 100,
      }),
    );
    return;
  }

  const [agg] = await db
    .select({
      totalTokens: sum(metricsTable.totalTokens),
      avgRam: avg(metricsTable.ramPercent),
      avgCpu: avg(metricsTable.cpuLoad),
      avgLatency: avg(metricsTable.latencyMs),
      peakRam: max(metricsTable.ramPercent),
      cnt: count(metricsTable.id),
    })
    .from(metricsTable);

  const totalTokens = Number(agg.totalTokens ?? 0);
  const totalIterations = Number(agg.cnt ?? 0);

  // Calculate real success rate from log entries
  const logCounts = await db
    .select({
      level: logsTable.level,
      cnt: count(logsTable.id),
    })
    .from(logsTable)
    .groupBy(logsTable.level);

  const totalLogs = logCounts.reduce((s, r) => s + Number(r.cnt), 0);
  const errorLogs = logCounts
    .filter((r) => r.level === "ERROR")
    .reduce((s, r) => s + Number(r.cnt), 0);
  const successRate =
    totalLogs > 0
      ? parseFloat((((totalLogs - errorLogs) / totalLogs) * 100).toFixed(1))
      : 100;

  res.json(
    GetMetricsSummaryResponse.parse({
      totalIterations,
      totalTokens,
      estimatedCostUsd: parseFloat((totalTokens * 0.002 / 1000).toFixed(5)),
      avgRamPercent: parseFloat(Number(agg.avgRam ?? 0).toFixed(1)),
      avgCpuLoad: parseFloat(Number(agg.avgCpu ?? 0).toFixed(2)),
      avgLatencyMs: parseFloat(Number(agg.avgLatency ?? 0).toFixed(0)),
      peakRamPercent: parseFloat(Number(agg.peakRam ?? 0).toFixed(1)),
      successRate,
    }),
  );
});

export default router;
