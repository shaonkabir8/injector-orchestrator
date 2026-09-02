// ===============================================================
// providers.js - Provider / API key store for the admin dashboard
//
// SECURITY MODEL
//   - Store lives OUTSIDE the repo: ~/.ollama_connector/config/providers.json
//     (cannot be committed, created with mode 0600)
//   - Full API keys are NEVER returned to the browser. list() masks them.
//   - Key values are never written to logs.
// ===============================================================

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const CONFIG_DIR = path.join(os.homedir(), ".ollama_connector", "config");
const STORE = path.join(CONFIG_DIR, "providers.json");

// Non-secret seed entries. Keys are intentionally empty — add them via the UI.
const SEED = [
  {
    id: "gonkarouter",
    label: "GonkaRouter",
    baseUrl: "https://api.gonkarouter.io/v1",
    defaultModel: "deepseek-ai/DeepSeek-V4-Flash-0731",
    apiKey: "",
    enabled: true,
  },
  {
    id: "kktoken",
    label: "KKToken",
    baseUrl: "https://kktoken.cc/v1",
    defaultModel: "",
    apiKey: "",
    enabled: true,
  },
  {
    id: "ollama-local",
    label: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen2.5:7b",
    apiKey: "ollama",
    enabled: true,
  },
];

function ensureStore() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(STORE)) {
    writeAll(SEED);
  }
  return STORE;
}

function readAll() {
  try {
    ensureStore();
    const raw = fs.readFileSync(STORE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.providers) ? parsed.providers : [];
  } catch {
    return [];
  }
}

function writeAll(providers) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const body = JSON.stringify({ version: 1, updated: Date.now(), providers }, null, 2);
  // Write via a temp file then rename, so a crash cannot truncate the store.
  const tmp = STORE + ".tmp";
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  fs.renameSync(tmp, STORE);
  try { fs.chmodSync(STORE, 0o600); } catch { /* best effort */ }
  return providers;
}

// Mask a key for display: keep provider prefix + last 4 chars only.
function maskKey(key) {
  if (!key) return "";
  if (key === "ollama") return "ollama";
  if (key.length <= 8) return "***";
  return key.slice(0, 3) + "\u2026" + key.slice(-4);
}

function publicView(p) {
  return {
    id: p.id,
    label: p.label || p.id,
    baseUrl: p.baseUrl || "",
    defaultModel: p.defaultModel || "",
    enabled: p.enabled !== false,
    hasKey: Boolean(p.apiKey),
    keyMasked: maskKey(p.apiKey),
  };
}

// Safe listing for the browser — never includes full key material.
function list() {
  return readAll().map(publicView);
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function validate(input) {
  const errors = [];
  const baseUrl = String(input.baseUrl || "").trim();
  if (baseUrl) {
    let u;
    try { u = new URL(baseUrl); } catch { u = null; }
    if (!u) errors.push("baseUrl is not a valid URL");
    else if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
      errors.push("baseUrl must use https (http allowed only for localhost)");
    }
  } else {
    errors.push("baseUrl is required");
  }
  if (!String(input.label || input.id || "").trim()) errors.push("label or id is required");
  return errors;
}

function upsert(input) {
  const errors = validate(input);
  if (errors.length) return { ok: false, errors };

  const providers = readAll();
  const id = slug(input.id || input.label);
  if (!id) return { ok: false, errors: ["could not derive a valid id"] };

  const idx = providers.findIndex((p) => p.id === id);
  const existing = idx >= 0 ? providers[idx] : null;

  const next = {
    id,
    label: String(input.label || (existing && existing.label) || id).trim(),
    baseUrl: String(input.baseUrl).trim(),
    defaultModel: String(input.defaultModel || (existing && existing.defaultModel) || "").trim(),
    // Empty apiKey on update means "leave the stored key unchanged".
    apiKey: input.apiKey ? String(input.apiKey).trim() : (existing ? existing.apiKey : ""),
    enabled: input.enabled === undefined ? (existing ? existing.enabled !== false : true) : Boolean(input.enabled),
  };

  if (idx >= 0) providers[idx] = next; else providers.push(next);
  writeAll(providers);
  return { ok: true, provider: publicView(next), created: idx < 0 };
}

function remove(id) {
  const providers = readAll();
  const idx = providers.findIndex((p) => p.id === id);
  if (idx < 0) return { ok: false, errors: ["provider not found: " + id] };
  providers.splice(idx, 1);
  writeAll(providers);
  return { ok: true, removed: id };
}

// Reveal a single full key. Deliberately separate from list() so that
// enumerating providers can never leak key material by accident.
function revealKey(id) {
  const p = readAll().find((x) => x.id === id);
  if (!p) return { ok: false, errors: ["provider not found: " + id] };
  return { ok: true, id, apiKey: p.apiKey || "" };
}

// Per-process admin token, regenerated on every server start.
const ADMIN_TOKEN = process.env.DASHBOARD_ADMIN_TOKEN || crypto.randomBytes(24).toString("hex");

function checkToken(req) {
  const sent = req.headers["x-admin-token"];
  if (!sent || typeof sent !== "string") return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  ensureStore, list, upsert, remove, revealKey,
  ADMIN_TOKEN, checkToken, STORE, maskKey,
};
