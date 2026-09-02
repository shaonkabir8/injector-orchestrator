// ===============================================================
// continue_data.js - Continue (Agentic AI) dev_data aggregator
// Reads ~/.continue/dev_data/0.2.0/*.jsonl and aggregates metrics.
// PRIVACY: never emits raw prompt/completion text. Aggregates only.
// ===============================================================

const fs = require("fs");
const path = require("path");
const os = require("os");

const DEV_DATA = path.join(os.homedir(), ".continue", "dev_data", "0.2.0");

// Rough cost estimate (USD per 1M tokens). Override via env if needed.
const COST_PER_M_PROMPT = Number(process.env.CONTINUE_COST_PROMPT || 3.0);
const COST_PER_M_GEN = Number(process.env.CONTINUE_COST_GEN || 15.0);

function readJsonl(file, limit) {
  const full = path.join(DEV_DATA, file);
  let rows = [];
  try {
    const raw = fs.readFileSync(full, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const slice = limit ? lines.slice(-limit) : lines;
    for (const line of slice) {
      try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  } catch { /* file may not exist yet */ }
  return rows;
}

function fileMtimes() {
  const out = {};
  for (const f of ["chatInteraction.jsonl", "tokensGenerated.jsonl", "toolUsage.jsonl", "editOutcome.jsonl"]) {
    try { out[f] = fs.statSync(path.join(DEV_DATA, f)).mtimeMs; } catch { out[f] = 0; }
  }
  return out;
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; }

function aggregate() {
  const tokens = readJsonl("tokensGenerated.jsonl");
  const chats = readJsonl("chatInteraction.jsonl");
  const tools = readJsonl("toolUsage.jsonl");
  const edits = readJsonl("editOutcome.jsonl");

  // Tokens + cost
  let promptTokens = 0, genTokens = 0;
  const byModel = {};
  for (const t of tokens) {
    const p = Number(t.promptTokens || 0), g = Number(t.generatedTokens || 0);
    promptTokens += p; genTokens += g;
    const key = t.model || t.provider || "unknown";
    if (!byModel[key]) byModel[key] = { model: key, provider: t.provider || "", promptTokens: 0, generatedTokens: 0, calls: 0 };
    byModel[key].promptTokens += p; byModel[key].generatedTokens += g; byModel[key].calls += 1;
  }
  const totalTokens = promptTokens + genTokens;
  const estCost = (promptTokens / 1e6) * COST_PER_M_PROMPT + (genTokens / 1e6) * COST_PER_M_GEN;

  // Tools (agentic signal)
  const toolAccepted = tools.filter((t) => t.accepted === true).length;
  const toolSucceeded = tools.filter((t) => t.succeeded === true).length;
  const byTool = {};
  for (const t of tools) {
    const fn = t.functionName || "unknown";
    if (!byTool[fn]) byTool[fn] = { name: fn, calls: 0, succeeded: 0 };
    byTool[fn].calls += 1;
    if (t.succeeded === true) byTool[fn].succeeded += 1;
  }

  // Edits
  const editsAccepted = edits.filter((e) => e.accepted === true).length;
  let linesAdded = 0, linesRemoved = 0;
  for (const e of edits) {
    const lc = Number(e.lineChange || 0);
    if (lc >= 0) linesAdded += lc; else linesRemoved += Math.abs(lc);
  }

  // Sessions / activity (no prompt text)
  const sessions = new Set(chats.map((c) => c.sessionId).filter(Boolean));
  const recent = chats.slice(-8).map((c) => ({
    timestamp: c.timestamp,
    modelTitle: c.modelTitle || c.modelName || "",
    provider: c.modelProvider || "",
    toolCount: Array.isArray(c.tools) ? c.tools.length : 0,
  }));

  return {
    status: "VERIFIED",
    timestamp: Date.now(),
    tokens: {
      total: totalTokens, prompt: promptTokens, generated: genTokens,
      estCostUsd: Math.round(estCost * 10000) / 10000,
    },
    models: Object.values(byModel).sort((a, b) => (b.promptTokens + b.generatedTokens) - (a.promptTokens + a.generatedTokens)),
    chat: { interactions: chats.length, sessions: sessions.size },
    tools: {
      calls: tools.length, accepted: toolAccepted, succeeded: toolSucceeded,
      successRate: pct(toolSucceeded, tools.length),
      acceptRate: pct(toolAccepted, tools.length),
      byTool: Object.values(byTool).sort((a, b) => b.calls - a.calls).slice(0, 10),
    },
    edits: {
      total: edits.length, accepted: editsAccepted,
      acceptRate: pct(editsAccepted, edits.length),
      linesAdded, linesRemoved,
    },
    recent,
  };
}

module.exports = { aggregate, fileMtimes, DEV_DATA };
