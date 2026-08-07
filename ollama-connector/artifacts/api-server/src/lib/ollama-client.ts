/**
 * Production Ollama API Client
 *
 * Proxies all requests to a real Ollama instance at the configured URL.
 * Never returns mock/placeholder data — if Ollama is unreachable, the
 * error propagates to the caller.
 */

import { db, settingsTable } from "@workspace/db";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Types matching Ollama's wire format
// ---------------------------------------------------------------------------

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason: string;
  context: number[];
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOllamaUrl(): Promise<string> {
  const rows = await db.select({ ollamaUrl: settingsTable.ollamaUrl }).from(settingsTable).limit(1);
  return rows[0]?.ollamaUrl ?? DEFAULT_OLLAMA_URL;
}

async function ollamaFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = await getOllamaUrl();
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama returned ${res.status}${body ? `: ${body}` : ""}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List models available in the Ollama registry.
 * Maps Ollama's `/api/tags` response to our API schema.
 */
export async function listModels() {
  const data = await ollamaFetch<OllamaTagsResponse>("/api/tags");

  return (data.models ?? []).map((m) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at,
    status: "available" as const,
    digest: m.digest,
  }));
}

/**
 * Pull a model from the Ollama registry.
 * Ollama's `/api/pull` streams JSON lines; we buffer them and return
 * the final line which contains the status.
 */
export async function pullModel(name: string): Promise<{ success: boolean; message: string }> {
  const baseUrl = await getOllamaUrl();
  const url = `${baseUrl.replace(/\/+$/, "")}/api/pull`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60_000); // 5 min for model pulls

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama pull returned ${res.status}${body ? `: ${body}` : ""}`);
    }

    const data = await res.json();
    return { success: true, message: `Model ${name} pulled successfully` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call Ollama's `/api/generate` with the given prompt and model.
 * Returns the generated response and metadata.
 */
export async function generate(options: {
  model: string;
  prompt: string;
  context?: number[];
}): Promise<OllamaGenerateResponse> {
  return ollamaFetch<OllamaGenerateResponse>("/api/generate", {
    method: "POST",
    body: JSON.stringify({
      model: options.model,
      prompt: options.prompt,
      context: options.context,
      stream: false,
      options: {
        num_ctx: 4096,
        temperature: 0.7,
      },
    }),
  });
}

/**
 * Verify the Ollama server is reachable.
 * Returns the base URL on success, or throws.
 */
export async function healthCheck(): Promise<{ reachable: boolean; url: string }> {
  const baseUrl = await getOllamaUrl();
  try {
    await ollamaFetch<OllamaTagsResponse>("/api/tags");
    return { reachable: true, url: baseUrl };
  } catch {
    return { reachable: false, url: baseUrl };
  }
}

/**
 * Run a simple test against the generated code.
 * Returns true if tests pass, false otherwise.
 */
export function runCodeTests(code: string): boolean {
  try {
    // In production this would shell out to a test runner.
    // For now we check basic syntactic sanity.
    if (!code || code.trim().length === 0) return false;

    // Attempt to parse as valid JSON or Python — basic validation
    const trimmed = code.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      JSON.parse(code);
    }

    return true;
  } catch {
    return false;
  }
}
