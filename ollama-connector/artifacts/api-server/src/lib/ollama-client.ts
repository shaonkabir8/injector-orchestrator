/**
 * Model provider client.
 *
 * Uses Ollama when no kktoken credentials are configured. When KKTOKEN_API_KEY
 * is present, requests use the OpenAI-compatible kktoken API instead.
 */

import { db, settingsTable } from "@workspace/db";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_KKTOKEN_URL = "https://kktoken.cc/v1";
const DEFAULT_KKTOKEN_MODEL = "claude-opus-5-thinking";
const FALLBACK_KKTOKEN_MODEL = "claude-opus-4-8-thinking";
const DEFAULT_KKTOKEN_SYSTEM_PROMPT = "Ponytail required. Caveman mood: ultra required.";
const REQUEST_TIMEOUT_MS = 30_000;

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

interface OpenAiModel {
  id: string;
  created?: number;
  owned_by?: string;
}

interface OpenAiModelsResponse {
  data?: OpenAiModel[];
}

interface OpenAiChatCompletion {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }> | null;
    };
  }>;
  usage?: {
    completion_tokens?: number;
  };
}

export interface ProviderModel {
  name: string;
  size: number;
  modifiedAt: string;
  status: "available";
  digest: string | null;
}

export interface ConnectionTestResult {
  success: boolean;
  reachable: boolean;
  url: string;
  message: string;
  models: ProviderModel[];
}

class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

function getKktokenKeys(): string[] {
  return [
    process.env["KKTOKEN_API_KEY"],
    process.env["KKTOKEN_OPTIONAL_API_KEY"],
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function isKktokenConfigured(): boolean {
  return getKktokenKeys().length > 0;
}

function getKktokenBaseUrl(): string {
  return (process.env["KKTOKEN_BASE_URL"] || DEFAULT_KKTOKEN_URL).replace(/\/+$/, "");
}

function isKktokenUrl(url: string): boolean {
  return url.toLowerCase().includes("kktoken.cc");
}

export function getDefaultModel(): string {
  return process.env["KKTOKEN_DEFAULT_MODEL"]?.trim() || DEFAULT_KKTOKEN_MODEL;
}

export function getFallbackModel(): string {
  return process.env["KKTOKEN_FALLBACK_MODEL"]?.trim() || FALLBACK_KKTOKEN_MODEL;
}

export async function getConfiguredBaseUrl(): Promise<string> {
  if (isKktokenConfigured()) return getKktokenBaseUrl();

  const rows = await db
    .select({ ollamaUrl: settingsTable.ollamaUrl })
    .from(settingsTable)
    .limit(1);
  return rows[0]?.ollamaUrl ?? DEFAULT_OLLAMA_URL;
}

function getKktokenSystemPrompt(): string {
  return process.env["KKTOKEN_SYSTEM_PROMPT"]?.trim() || DEFAULT_KKTOKEN_SYSTEM_PROMPT;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function shouldTryNextKey(error: unknown): boolean {
  return error instanceof ProviderHttpError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500);
}

async function readProviderError(response: Response, provider: string): Promise<ProviderHttpError> {
  const body = await response.text().catch(() => "");
  const detail = body ? ": " + body.slice(0, 500) : "";
  return new ProviderHttpError(provider + " returned " + response.status + detail, response.status);
}

async function fetchJsonAt<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(normalizeBaseUrl(baseUrl) + path, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw await readProviderError(response, "Model provider");
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function kktokenFetchAt<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const keys = getKktokenKeys();
  if (keys.length === 0) {
    throw new Error("KKTOKEN_API_KEY is required for the kktoken provider");
  }

  let lastError: unknown;
  for (let index = 0; index < keys.length; index++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(normalizeBaseUrl(baseUrl) + path, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
          Authorization: "Bearer " + keys[index],
        },
      });

      if (!response.ok) {
        const error = await readProviderError(response, "kktoken");
        if (index < keys.length - 1 && shouldTryNextKey(error)) {
          lastError = error;
          continue;
        }
        throw error;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (index < keys.length - 1 && shouldTryNextKey(error)) {
        lastError = error;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("kktoken request failed");
}

async function fetchKktokenModels(baseUrl = getKktokenBaseUrl()): Promise<ProviderModel[]> {
  const data = await kktokenFetchAt<OpenAiModelsResponse>(baseUrl, "/models");
  return (data.data ?? []).map((model) => ({
    name: model.id,
    size: 0,
    modifiedAt: model.created ? new Date(model.created * 1000).toISOString() : "",
    status: "available" as const,
    digest: model.owned_by ?? null,
  }));
}

async function fetchOllamaModels(baseUrl: string): Promise<ProviderModel[]> {
  const data = await fetchJsonAt<OllamaTagsResponse>(baseUrl, "/api/tags");
  return (data.models ?? []).map((model) => ({
    name: model.name,
    size: model.size,
    modifiedAt: model.modified_at,
    status: "available" as const,
    digest: model.digest,
  }));
}

/** List models from the configured provider. */
export async function listModels(): Promise<ProviderModel[]> {
  if (isKktokenConfigured()) return fetchKktokenModels();
  return fetchOllamaModels(await getConfiguredBaseUrl());
}

/** Ollama can pull models locally; hosted OpenAI-compatible providers cannot. */
export async function pullModel(name: string): Promise<{ success: boolean; message: string }> {
  if (isKktokenConfigured()) {
    return {
      success: false,
      message: "Model pulling is not supported by the configured kktoken provider",
    };
  }

  const baseUrl = await getConfiguredBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60_000);

  try {
    const response = await fetch(normalizeBaseUrl(baseUrl) + "/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: false }),
      signal: controller.signal,
    });

    if (!response.ok) throw await readProviderError(response, "Ollama");
    await response.json();
    return { success: true, message: "Model " + name + " pulled successfully" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message };
  } finally {
    clearTimeout(timeout);
  }
}

/** Generate text through Ollama or the configured OpenAI-compatible provider. */
export async function generate(options: {
  model: string;
  prompt: string;
  context?: number[];
}): Promise<OllamaGenerateResponse> {
  if (!isKktokenConfigured()) {
    return fetchJsonAt<OllamaGenerateResponse>(await getConfiguredBaseUrl(), "/api/generate", {
      method: "POST",
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        context: options.context,
        stream: false,
        options: { num_ctx: 4096, temperature: 0.7 },
      }),
    });
  }

  const startedAt = Date.now();
  const completion = await kktokenFetchAt<OpenAiChatCompletion>(getKktokenBaseUrl(), "/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: getKktokenSystemPrompt() },
        { role: "user", content: options.prompt },
      ],
      stream: false,
      temperature: 0.7,
    }),
  });

  const rawContent = completion.choices?.[0]?.message?.content;
  const response = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((part) => part.text ?? "").join("")
      : "";

  if (!response) throw new Error("kktoken returned no completion text");

  return {
    model: completion.model ?? options.model,
    created_at: new Date().toISOString(),
    response,
    done: true,
    done_reason: "stop",
    context: options.context ?? [],
    total_duration: (Date.now() - startedAt) * 1_000_000,
    load_duration: 0,
    prompt_eval_count: 0,
    prompt_eval_duration: 0,
    eval_count: completion.usage?.completion_tokens ?? 0,
    eval_duration: 0,
  };
}

/** Verify that the configured provider is reachable. */
export async function healthCheck(): Promise<{ reachable: boolean; url: string }> {
  const url = await getConfiguredBaseUrl();
  try {
    if (isKktokenConfigured()) await fetchKktokenModels(url);
    else await fetchOllamaModels(url);
    return { reachable: true, url };
  } catch {
    return { reachable: false, url };
  }
}

/** Test a provider URL, using stored kktoken credentials when appropriate. */
export async function testConnection(url?: string): Promise<ConnectionTestResult> {
  const configuredUrl = await getConfiguredBaseUrl();
  const baseUrl = normalizeBaseUrl(url?.trim() || configuredUrl);
  const useKktoken = isKktokenUrl(baseUrl) || (!url && isKktokenConfigured());

  try {
    const models = useKktoken
      ? await fetchKktokenModels(baseUrl)
      : await fetchOllamaModels(baseUrl);
    return {
      success: true,
      reachable: true,
      url: baseUrl,
      message: "Connected — " + models.length + " model" + (models.length === 1 ? "" : "s") + " found",
      models,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error";
    return { success: false, reachable: false, url: baseUrl, message, models: [] };
  }
}

/** Basic syntactic sanity check for generated code. */
export function runCodeTests(code: string): boolean {
  try {
    if (!code || code.trim().length === 0) return false;
    const trimmed = code.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) JSON.parse(code);
    return true;
  } catch {
    return false;
  }
}
