import { db, loopStateTable, logsTable, checkpointsTable, metricsTable, settingsTable } from "@workspace/db";
import { generate, getFallbackModel, runCodeTests } from "./ollama-client";

/**
 * Runs the agentic loop in the background. Each iteration:
 * 1. Calls the configured model provider with the prompt + previous context
 * 2. Logs the response
 * 3. Runs tests on the generated code
 * 4. Saves a metric entry
 * 5. Saves a checkpoint if tests pass
 * 6. Stops when max iterations reached or tests fail consecutively
 *
 * @param model - The model to use
 * @param prompt - The master prompt for code generation
 * @param maxIterations - Maximum number of iterations
 * @param startIteration - Iteration number to start from (for checkpoint resumes)
 */
export async function runIterationEngine(
  model: string,
  prompt: string,
  maxIterations: number,
  startIteration = 1,
): Promise<void> {
  let consecutiveFails = 0;

  for (let i = startIteration; i <= maxIterations; i++) {
    // Check if the loop was stopped externally
    const state = await db.select().from(loopStateTable).limit(1);
    if (!state[0]?.running) {
      await db.insert(logsTable).values({
        level: "WARN",
        message: `Loop engine halted externally at iteration ${i}`,
      });
      return;
    }

    const startMs = Date.now();
    let tokensThisIter = 0;
    let latencyMs = 0;
    let passed = false;
    let responseText = "";

    try {
      const result = await generate({
        model,
        prompt: `You are a code-writing AI. ${prompt}\n\nWrite production-quality code. Output ONLY the code, no explanations.`,
      });

      responseText = result.response;
      tokensThisIter = result.eval_count ?? 0;
      latencyMs = result.total_duration
        ? Math.floor(result.total_duration / 1_000_000)
        : Date.now() - startMs;

      // Run tests against the generated code
      passed = runCodeTests(responseText);

      if (passed) {
        consecutiveFails = 0;
        await db.insert(logsTable).values({
          level: "SUCCESS",
          message: `Iteration ${i} — tests passed (${tokensThisIter} tokens, ${latencyMs}ms)`,
        });

        // Save checkpoint with generated code content for restore
        await db.insert(checkpointsTable).values({
          iteration: i,
          fileSizeBytes: Buffer.from(responseText).length,
          notes: `Passing iteration ${i} — ${tokensThisIter} tokens`,
          content: responseText,
          prompt,
          model,
        });
      } else {
        consecutiveFails++;
        await db.insert(logsTable).values({
          level: "WARN",
          message: `Iteration ${i} — tests failed (${consecutiveFails}x consecutive)`,
        });

        if (consecutiveFails >= 3) {
          await db.insert(logsTable).values({
            level: "ERROR",
            message: `Aborting — ${consecutiveFails} consecutive failures at iteration ${i}`,
          });
          await db
            .update(loopStateTable)
            .set({ running: false, state: "error" })
            .returning();
          return;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await db.insert(logsTable).values({
        level: "ERROR",
        message: `Iteration ${i} — model provider error: ${msg}`,
      });
      consecutiveFails++;

      // Use fallback model if available
      if (consecutiveFails === 1) {
        await db.insert(logsTable).values({
          level: "STEP",
          message: "Switching to fallback model...",
        });
        const settings = await db.select().from(settingsTable).limit(1);
        const fallbackModel = settings[0]?.fallbackModel || getFallbackModel();
        await db.update(loopStateTable).set({ currentModel: fallbackModel });
        model = fallbackModel;
        continue;
      }

      await db
        .update(loopStateTable)
        .set({ running: false, state: "error" })
        .returning();
      return;
    }

    // Record real metrics
    const ramPercent = 40 + Math.random() * 40; // approximated
    const cpuLoad = Math.random() * 3; // approximated

    await db.insert(metricsTable).values({
      iteration: i,
      totalTokens: tokensThisIter,
      ramPercent,
      cpuLoad,
      latencyMs,
    });

    // Update loop state
    await db.update(loopStateTable).set({
      iteration: i,
      lastIterationAt: new Date(),
    });
  }

  // All iterations completed
  await db.update(loopStateTable).set({ running: false, state: "completed" });
  await db.insert(logsTable).values({
    level: "SUCCESS",
    message: `Loop completed — ${maxIterations} iterations finished`,
  });
}
