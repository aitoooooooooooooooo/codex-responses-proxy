#!/usr/bin/env node
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_DIR = process.env.CONFIG_DIR || path.join(os.homedir(), ".codex-responses-proxy");
export const CONFIG_PATH = process.env.CONFIG_PATH || path.join(CONFIG_DIR, "config.json");

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    log.info(`[config] created ${CONFIG_DIR}`);
  }
}

process.on("uncaughtException", (err) => log.error("[proxy] uncaught:", err.message));
process.on("unhandledRejection", (err) => log.error("[proxy] rejection:", err?.message || err));

// === Logging ===
const LOG_LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const LOG_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LOG_LEVELS.info;
const log = {
  error: (...a) => { if (LOG_LEVEL >= LOG_LEVELS.error) console.error(...a); },
  warn: (...a) => { if (LOG_LEVEL >= LOG_LEVELS.warn) console.warn(...a); },
  info: (...a) => { if (LOG_LEVEL >= LOG_LEVELS.info) console.log(...a); },
  debug: (...a) => { if (LOG_LEVEL >= LOG_LEVELS.debug) console.log(...a); },
};

// === Constants ===
const STORE_TTL = Number(process.env.STORE_TTL_MS) || 3600000;
const STORE_MAX = Number(process.env.STORE_MAX) || 500;
const UPSTREAM_TIMEOUT = Number(process.env.UPSTREAM_TIMEOUT_MS) || 120000;
const MAX_RECENT_LOGS = 100;

// agentrouter 会校验客户端身份，需模拟 Roo Code 的 10 个头
// 参考: https://github.com/thisisdarkstar/agent-router-unauthorized-fix
const AGENTROUTER_DEFAULT_HEADERS = {
  "User-Agent": "RooCode/3.53.0",
  "X-Title": "Roo Code",
  "HTTP-Referer": "https://github.com/RooVetGit/Roo-Cline",
  "X-Stainless-OS": "Linux",
  "X-Stainless-Arch": "x64",
  "X-Stainless-Lang": "js",
  "X-Stainless-Runtime": "node",
  "X-Stainless-Runtime-Version": "v22.22.1",
  Accept: "application/json",
};

const PROVIDER_PRESETS = [
  // agentrouter：保存后若 headers 为空，upstream 请求会自动合并 AGENTROUTER_DEFAULT_HEADERS（Roo Code 头）
  {
    id: "agentrouter",
    label: "AgentRouter（内置 Roo 请求头）",
    name: "agentrouter",
    baseUrl: "https://agentrouter.org/v1",
    thinkingStyle: "deepseek",
    models: ["glm-5.1", "deepseek-v4-pro", "deepseek-v4-flash"],
    docsUrl: "https://agentrouter.org",
  },
  {
    id: "mimo-cn",
    label: "MiMo（国内）",
    name: "mimo",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    thinkingStyle: "mimo",
    models: ["mimo-v2.5-pro", "mimo-v2.5"],
    docsUrl: "https://platform.xiaomimimo.com/docs",
  },
  {
    id: "mimo-global",
    label: "MiMo（国际）",
    name: "mimo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    thinkingStyle: "mimo",
    models: ["mimo-v2.5-pro", "mimo-v2.5"],
    docsUrl: "https://platform.xiaomimimo.com/docs",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    name: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    thinkingStyle: "deepseek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    docsUrl: "https://platform.deepseek.com/api-docs",
  },
  {
    id: "zhipu",
    label: "智谱 GLM（Coding）",
    name: "zhipu",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    thinkingStyle: "passthrough",
    models: ["glm-4-flash", "glm-4-plus"],
    docsUrl: "https://open.bigmodel.cn/dev/api",
  },
  {
    id: "minimax-cn",
    label: "MiniMax（国内）",
    name: "minimax",
    baseUrl: "https://api.minimaxi.com/v1",
    thinkingStyle: "passthrough",
    models: ["MiniMax-Text-01", "abab6.5s-chat"],
    docsUrl: "https://platform.minimaxi.com/document",
  },
  {
    id: "minimax-global",
    label: "MiniMax（国际）",
    name: "minimax",
    baseUrl: "https://api.minimax.io/v1",
    thinkingStyle: "passthrough",
    models: ["MiniMax-Text-01", "abab6.5s-chat"],
    docsUrl: "https://www.minimax.io/platform/document",
  },
];

// === Stats ===
const stats = {
  startedAt: Date.now(),
  totalRequests: 0,
  byProvider: {},
  byModel: {},
  recentLogs: [],
};

function recordRequest(providerName, model, ok, ms) {
  stats.totalRequests++;
  stats.byProvider[providerName] = (stats.byProvider[providerName] || 0) + 1;
  stats.byModel[model] = (stats.byModel[model] || 0) + 1;
  stats.recentLogs.unshift({
    at: new Date().toISOString(),
    provider: providerName,
    model,
    ok,
    ms,
  });
  if (stats.recentLogs.length > MAX_RECENT_LOGS) stats.recentLogs.length = MAX_RECENT_LOGS;
}

// === Config ===
function defaultConfig() {
  return {
    port: 3001,
    localKeys: [],
    defaultProvider: "agentrouter",
    modelAliases: {},
    providers: [
      {
        name: "agentrouter",
        baseUrl: "https://agentrouter.org/v1",
        apiKey: "",
        models: ["glm-5.1", "deepseek-v4-pro", "deepseek-v4-flash"],
        thinkingStyle: "deepseek",
        headers: { ...AGENTROUTER_DEFAULT_HEADERS },
      },
      {
        name: "mimo",
        baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
        apiKey: "",
        models: ["mimo-v2.5-pro", "mimo-v2.5"],
        thinkingStyle: "mimo",
        headers: {},
      },
    ],
  };
}

let runtimeConfig = defaultConfig();
let boundPort = runtimeConfig.port;

function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object") errors.push("config must be an object");
  const port = Number(cfg?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push("port must be 1-65535");
  if (!Array.isArray(cfg?.providers) || cfg.providers.length === 0) errors.push("providers must be a non-empty array");
  for (const p of cfg?.providers || []) {
    if (!p.name?.trim()) errors.push("provider name required");
    if (!p.baseUrl?.trim()) errors.push(`provider ${p.name}: baseUrl required`);
    if (!Array.isArray(p.models) || p.models.length === 0) errors.push(`provider ${p.name}: models required`);
    const style = p.thinkingStyle || "passthrough";
    if (!["deepseek", "mimo", "passthrough"].includes(style)) errors.push(`provider ${p.name}: invalid thinkingStyle`);
  }
  if (cfg.defaultProvider && !cfg.providers?.some((p) => p.name === cfg.defaultProvider)) {
    errors.push(`defaultProvider "${cfg.defaultProvider}" not found`);
  }
  return errors;
}

function loadConfigFromDisk() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    const legacyPaths = [
      path.join(process.cwd(), "config.json"),
      path.join(__dirname, "config.json"),
    ];
    for (const legacy of legacyPaths) {
      if (legacy !== CONFIG_PATH && fs.existsSync(legacy)) {
        fs.copyFileSync(legacy, CONFIG_PATH);
        log.info(`[config] migrated ${legacy} → ${CONFIG_PATH}`);
        const parsed = normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));
        const errors = validateConfig(parsed);
        if (errors.length) throw new Error(`Invalid config: ${errors.join("; ")}`);
        return parsed;
      }
    }
    const d = defaultConfig();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(d, null, 2));
    log.info(`[config] created default ${CONFIG_PATH}`);
    return d;
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const parsed = normalizeConfig(JSON.parse(raw));
  const errors = validateConfig(parsed);
  if (errors.length) throw new Error(`Invalid config: ${errors.join("; ")}`);
  return parsed;
}

function getConfig() {
  return runtimeConfig;
}

function setConfig(cfg, { persist = true } = {}) {
  const normalized = normalizeConfig(cfg);
  const errors = validateConfig(normalized);
  if (errors.length) return { ok: false, errors };
  const portChanged = normalized.port !== boundPort;
  runtimeConfig = normalized;
  if (persist) {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2));
  }
  return { ok: true, portChanged };
}

function maskKey(key) {
  if (!key || key.length < 8) return key ? "****" : "";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function normalizeLocalKeyEntry(entry) {
  if (typeof entry === "string") {
    const key = entry.trim();
    return key ? { key } : null;
  }
  if (entry && typeof entry === "object" && typeof entry.key === "string" && entry.key.trim()) {
    const out = { key: entry.key.trim() };
    if (entry.provider?.trim()) out.provider = entry.provider.trim();
    if (entry.model?.trim()) out.model = entry.model.trim();
    if (entry.label?.trim()) out.label = entry.label.trim();
    return out;
  }
  return null;
}

function getLocalKeyEntries(cfg) {
  const entries = [];
  const seen = new Set();
  for (const item of cfg?.localKeys || []) {
    const n = normalizeLocalKeyEntry(item);
    if (!n || seen.has(n.key)) continue;
    seen.add(n.key);
    entries.push(n);
  }
  if (cfg?.localKey && typeof cfg.localKey === "string" && cfg.localKey.trim() && !seen.has(cfg.localKey.trim())) {
    entries.push({ key: cfg.localKey.trim() });
  }
  return entries;
}

function getLocalKeys(cfg) {
  return getLocalKeyEntries(cfg).map((e) => e.key);
}

function matchLocalKeyEntry(token) {
  if (!token) return null;
  return getLocalKeyEntries(getConfig()).find((e) => e.key === token) || null;
}

/** 合并 localKeys：key 保留项用 __KEEP:n__，支持 provider/model/label 绑定 */
function mergeLocalKeys(incoming, currentEntries) {
  const current = getLocalKeyEntries({ localKeys: currentEntries });
  if (!Array.isArray(incoming)) return current;
  const out = [];
  const seen = new Set();
  for (const item of incoming) {
    let entry = null;
    if (typeof item === "string") {
      const keep = /^__KEEP:(\d+)__$/.exec(item);
      if (keep) {
        const prev = current[Number(keep[1])];
        if (prev) entry = { ...prev };
      } else if (item.trim()) {
        entry = { key: item.trim() };
      }
    } else if (item && typeof item === "object") {
      let key = typeof item.key === "string" ? item.key.trim() : "";
      const keep = /^__KEEP:(\d+)__$/.exec(key);
      if (keep) {
        const prev = current[Number(keep[1])];
        if (!prev) continue;
        key = prev.key;
        entry = { key, provider: prev.provider, model: prev.model, label: prev.label };
      } else if (key) {
        entry = { key };
      }
      if (entry) {
        if (item.provider?.trim()) entry.provider = item.provider.trim();
        else delete entry.provider;
        if (item.model?.trim()) entry.model = item.model.trim();
        else delete entry.model;
        if (item.label?.trim()) entry.label = item.label.trim();
        else delete entry.label;
      }
    }
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push(entry);
  }
  return out;
}

function normalizeConfig(cfg) {
  const normalized = { ...cfg, localKeys: getLocalKeyEntries(cfg) };
  delete normalized.localKey;
  delete normalized.providerPresets;
  return normalized;
}

function isMaskedKey(key) {
  return typeof key === "string" && key.includes("...");
}

function publicConfig(cfg) {
  const entries = getLocalKeyEntries(cfg);
  const { localKeys, localKey, ...rest } = cfg;
  return {
    ...rest,
    providers: cfg.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey || "",
      hasApiKey: !!p.apiKey,
    })),
    localKeyEntries: entries.map((e) => ({
      key: e.key,
      provider: e.provider || "",
      model: e.model || "",
      label: e.label || "",
      bound: !!(e.provider || e.model),
    })),
    localKeysCount: entries.length,
    hasLocalKey: entries.length > 0,
    boundPort,
    portRestartRequired: cfg.port !== boundPort,
    providerPresets: PROVIDER_PRESETS,
  };
}

// === Auth ===
function parseBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function checkAuth(req, pathOnly) {
  if (pathOnly === "/health") return true;
  const entries = getLocalKeyEntries(getConfig());
  if (entries.length === 0) return true;
  const token = parseBearer(req);
  const entry = matchLocalKeyEntry(token);
  if (entry) req._localKeyEntry = entry;
  return !!entry;
}

function applyKeyBinding(body, keyEntry) {
  if (!keyEntry) return { ok: true, model: body.model };
  const cfg = getConfig();
  let model = body.model;

  if (keyEntry.model) {
    const requested = model ? normalizeModelId(model) : "";
    const bound = normalizeModelId(resolveModelName(keyEntry.model));
    if (requested && requested !== bound) {
      return {
        ok: false,
        error: `此 Key 仅限模型「${keyEntry.model}」，当前请求为「${model}」`,
      };
    }
    model = keyEntry.model;
  }

  if (keyEntry.provider) {
    const provider = cfg.providers.find((p) => p.name === keyEntry.provider);
    if (!provider) {
      return { ok: false, error: `Key 绑定的渠道「${keyEntry.provider}」不存在` };
    }
    const route = resolveProvider(model);
    if (route.error) {
      return { ok: false, error: route.error };
    }
    if (route.provider.name !== keyEntry.provider) {
      if (keyEntry.model) {
        model = keyEntry.model;
      } else if (provider.models?.length) {
        const norm = normalizeModelId(route.model);
        const onProvider = provider.models.some((m) => normalizeModelId(m) === norm);
        model = onProvider ? route.model : provider.models[0];
      } else {
        return {
          ok: false,
          error: `此 Key 仅限渠道「${keyEntry.provider}」，模型「${model}」不在该渠道`,
        };
      }
    }
  }

  return { ok: true, model };
}

// === Routing ===
function normalizeModelId(model) {
  return String(model || "").trim().toLowerCase();
}

function resolveModelName(model) {
  const cfg = getConfig();
  const aliases = cfg.modelAliases || {};
  return aliases[model] || model;
}

function resolveProvider(model) {
  const cfg = getConfig();
  const resolved = resolveModelName(model);
  const norm = normalizeModelId(resolved);

  for (const p of cfg.providers) {
    if (p.models.some((m) => normalizeModelId(m) === norm)) {
      return { provider: p, model: resolved };
    }
  }

  const def = cfg.providers.find((p) => p.name === cfg.defaultProvider);
  if (def) return { provider: def, model: resolved, fallback: true };

  return { error: `Model "${model}" not configured on any provider and no defaultProvider set` };
}

function listAllModels() {
  const cfg = getConfig();
  const seen = new Set();
  const out = [];
  for (const p of cfg.providers) {
    for (const m of p.models) {
      const id = normalizeModelId(m);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id: m, object: "model", owned_by: p.name });
    }
  }
  for (const [alias, target] of Object.entries(cfg.modelAliases || {})) {
    out.push({ id: alias, object: "model", owned_by: "alias", alias_of: target });
  }
  return out;
}

// === Response store ===
const responseStore = new Map();

function touchResponse(id) {
  if (!id) return undefined;
  const entry = responseStore.get(id);
  if (!entry) return undefined;
  responseStore.delete(id);
  responseStore.set(id, entry);
  return entry;
}

function storeResponse(id, data) {
  if (!id) return;
  if (responseStore.size >= STORE_MAX) {
    const now = Date.now();
    for (const [k, v] of responseStore) {
      if (now - v.storedAt > STORE_TTL) responseStore.delete(k);
    }
    if (responseStore.size >= STORE_MAX) {
      const oldest = responseStore.keys().next().value;
      responseStore.delete(oldest);
    }
  }
  responseStore.set(id, { ...data, storedAt: Date.now() });
}

function resolveResponseChain(previousResponseId) {
  const chain = [];
  let currentId = previousResponseId;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const stored = touchResponse(currentId);
    if (!stored) {
      log.warn(`[store] previous_response_id ${currentId} not found`);
      break;
    }
    chain.unshift(stored);
    currentId = stored.previousResponseId;
  }
  const items = [];
  for (const entry of chain) {
    if (Array.isArray(entry.input)) items.push(...entry.input);
    if (Array.isArray(entry.output)) items.push(...entry.output);
  }
  return items;
}

function normalizeInputToArray(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string") {
    return [{ type: "message", role: "user", content: [{ type: "input_text", text: input }] }];
  }
  return [];
}

function maybeResolvePreviousResponseChain(body) {
  if (!body.previous_response_id) return;
  const chainItems = resolveResponseChain(body.previous_response_id);
  if (chainItems.length === 0) {
    log.warn(`[store] could not restore history for ${body.previous_response_id}`);
    return;
  }
  const currentInput = normalizeInputToArray(body.input);
  body.input = [...chainItems, ...currentInput];
  delete body.previous_response_id;
  log.info(`[store] restored ${chainItems.length} items from previous_response_id`);
}

// === Message normalization (from codex-bridge) ===
function normalizeMessages(messages, { coerceStrings = false } = {}) {
  const work = [...messages];
  const fixed = [];
  for (let i = 0; i < work.length; i++) {
    const msg = work[i];
    if (msg === null) continue;
    if (msg.role === "assistant" && msg.tool_calls) {
      fixed.push(msg);
      const callIds = new Set(msg.tool_calls.map((tc) => tc.id));
      for (let j = i + 1; j < work.length; j++) {
        if (work[j]?.role === "tool" && callIds.has(work[j].tool_call_id)) {
          fixed.push(work[j]);
          work[j] = null;
        }
      }
    } else if (msg.role === "tool") {
      const lastTc = [...fixed].reverse().find((m) => m.role === "assistant" && m.tool_calls);
      if (lastTc) {
        let insertIdx = fixed.indexOf(lastTc) + 1;
        while (insertIdx < fixed.length && fixed[insertIdx].role === "tool") insertIdx++;
        fixed.splice(insertIdx, 0, msg);
        work[i] = null;
      }
    } else {
      fixed.push(msg);
    }
  }

  const merged = [];
  for (const msg of fixed) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role && msg.role === "user" &&
        typeof prev.content === "string" && typeof msg.content === "string") {
      prev.content += "\n\n" + msg.content;
    } else if (prev && prev.role === msg.role && msg.role === "assistant" &&
        !prev.tool_calls && !msg.tool_calls &&
        typeof prev.content === "string" && typeof msg.content === "string") {
      prev.content += "\n\n" + msg.content;
    } else if (prev && prev.role === "assistant" && msg.role === "assistant" &&
        !prev.tool_calls && msg.tool_calls) {
      merged[merged.length - 1] = msg;
    } else if (prev && prev.role === "assistant" && msg.role === "assistant" &&
        prev.tool_calls && !msg.tool_calls) {
      // drop text-only assistant after tool_calls
    } else {
      merged.push(msg);
    }
  }

  const validated = [];
  for (const msg of merged) {
    if (msg.role === "tool") {
      const prev = validated[validated.length - 1];
      if (prev && (prev.role === "tool" || (prev.role === "assistant" && prev.tool_calls))) {
        validated.push(msg);
      }
    } else {
      validated.push(msg);
    }
  }

  if (coerceStrings) {
    for (const msg of validated) {
      if (msg.role === "assistant" && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (!tc.function) continue;
          const args = tc.function.arguments;
          if (args === undefined || args === null || args === "") tc.function.arguments = "{}";
          else if (typeof args !== "string") tc.function.arguments = JSON.stringify(args);
        }
      }
      if (msg.role === "tool" && typeof msg.content !== "string") {
        msg.content = JSON.stringify(msg.content);
      }
    }
  }
  return validated;
}

// === Effort translation ===
function applyEffortTranslation(req, effort, thinkingStyle) {
  if (!effort || thinkingStyle === "passthrough") {
    if (effort && thinkingStyle === "passthrough") req.reasoning_effort = String(effort).toLowerCase().trim();
    return;
  }
  const e = String(effort).toLowerCase().trim();
  if (e === "none") {
    req.thinking = { type: "disabled" };
    return;
  }
  if (e === "minimal") {
    req.reasoning_effort = "low";
    return;
  }
  if (thinkingStyle === "mimo" && (e === "max" || e === "xhigh")) {
    req.reasoning_effort = "high";
    return;
  }
  req.reasoning_effort = e;
}

// === Responses -> Chat Completions ===
function responsesRequestToChatCompletions(body, thinkingStyle) {
  const messages = [];
  if (body.instructions) {
    messages.push({
      role: "user",
      content: "[System Instructions] " + body.instructions + "\n\nNote: Be efficient with tool calls.",
    });
  }

  const reasoningByCallId = new Map();
  if (thinkingStyle === "deepseek") {
    for (const entry of responseStore.values()) {
      if (!entry.reasoningContent) continue;
      for (const out of entry.output || []) {
        if (out.type === "function_call" && out.call_id) {
          reasoningByCallId.set(out.call_id, entry.reasoningContent);
        }
      }
    }
  }

  if (typeof body.input === "string") {
    messages.push({ role: "user", content: body.input });
  } else if (Array.isArray(body.input)) {
    let pendingToolCalls = [];
    const flushPendingToolCalls = () => {
      if (pendingToolCalls.length === 0) return;
      const msg = { role: "assistant", content: null, tool_calls: pendingToolCalls };
      for (const tc of pendingToolCalls) {
        const r = reasoningByCallId.get(tc.id);
        if (r) { msg.reasoning_content = r; break; }
      }
      messages.push(msg);
      pendingToolCalls = [];
    };

    for (const item of body.input) {
      const itemType = item.type || (item.role ? "message" : undefined);
      if (itemType === "message") {
        const role = (item.role === "developer" || item.role === "system") ? "user" : item.role;
        let content;
        if (typeof item.content === "string") content = item.content;
        else if (Array.isArray(item.content)) {
          content = item.content.map((block) => {
            if (block.type === "input_text" || block.type === "output_text") return { type: "text", text: block.text };
            if (block.type === "input_image") return { type: "image_url", image_url: { url: block.image_url || block.url } };
            return block;
          });
          if (content.length === 1 && content[0].type === "text") content = content[0].text;
        }
        flushPendingToolCalls();
        messages.push({ role, content });
      } else if (itemType === "function_call") {
        pendingToolCalls.push({
          id: item.call_id || item.id,
          type: "function",
          function: { name: item.name, arguments: item.arguments },
        });
      } else if (itemType === "function_call_output") {
        flushPendingToolCalls();
        messages.push({ role: "tool", tool_call_id: item.call_id, content: item.output });
      }
    }
    flushPendingToolCalls();
  }

  const merged = normalizeMessages(messages);
  const MAX_MESSAGES = 55;
  let finalMessages = merged;
  if (merged.length > MAX_MESSAGES) {
    const head = merged.slice(0, 2);
    let tail = merged.slice(-(MAX_MESSAGES - 3));
    while (tail.length > 0 && tail[0].role === "tool") tail.shift();
    finalMessages = [
      ...head,
      { role: "user", content: "[Earlier conversation trimmed. Continue with the current task.]" },
      ...tail,
    ];
    finalMessages = normalizeMessages(finalMessages);
  }

  const req = {
    model: body.model,
    messages: finalMessages,
    stream: body.stream || false,
  };
  if (body.temperature != null) req.temperature = body.temperature;
  if (body.top_p != null) req.top_p = body.top_p;
  req.max_tokens = body.max_output_tokens || 16384;

  if (body.tools?.length > 0) {
    const supported = body.tools.filter((t) => t.type === "function");
    if (supported.length > 0) {
      req.tools = supported.map((t) => {
        if (!t.function) {
          return { type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } };
        }
        return t;
      });
    }
  }

  if (body.tool_choice != null) {
    if (typeof body.tool_choice === "object" && body.tool_choice.name) {
      req.tool_choice = { type: "function", function: { name: body.tool_choice.name } };
    } else {
      req.tool_choice = body.tool_choice;
    }
  }

  applyEffortTranslation(req, body.reasoning?.effort, thinkingStyle);

  if (thinkingStyle === "deepseek" && req.thinking?.type !== "disabled") {
    const hasAssistantToolCalls = finalMessages.some(
      (m) => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0 && !m.reasoning_content
    );
    if (hasAssistantToolCalls) {
      req.thinking = { type: "disabled" };
      delete req.reasoning_effort;
    }
  }

  if (body.parallel_tool_calls != null) req.parallel_tool_calls = body.parallel_tool_calls;
  return req;
}

// === Chat Completions -> Responses ===
function uid() {
  return crypto.randomBytes(12).toString("base64url");
}

function translateUsage(u) {
  if (!u) return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  return {
    input_tokens: u.prompt_tokens || 0,
    output_tokens: u.completion_tokens || 0,
    total_tokens: u.total_tokens || 0,
    input_tokens_details: { cached_tokens: u.prompt_tokens_details?.cached_tokens || 0 },
    output_tokens_details: { reasoning_tokens: u.completion_tokens_details?.reasoning_tokens || 0 },
  };
}

function chatCompletionToResponse(cc, model, previousResponseId, metadata) {
  const responseId = `resp_${uid()}`;
  const output = [];
  const choice = cc.choices?.[0];
  if (!choice) {
    return {
      id: responseId,
      object: "response",
      created_at: cc.created || Math.floor(Date.now() / 1000),
      status: "completed",
      model: model || cc.model,
      output: [],
      usage: translateUsage(cc.usage),
    };
  }

  const msg = choice.message;
  if (msg.tool_calls?.length > 0) {
    for (const tc of msg.tool_calls) {
      output.push({
        type: "function_call",
        id: `fc_${uid()}`,
        call_id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
        status: "completed",
      });
    }
  }

  let text = (msg.content || "").replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
  if (text) {
    output.push({
      type: "message",
      id: `msg_${uid()}`,
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text, annotations: [] }],
    });
  }

  let status = "completed";
  let incompleteDetails = null;
  if (choice.finish_reason === "length") {
    status = "incomplete";
    incompleteDetails = { reason: "max_output_tokens" };
  }

  return {
    id: responseId,
    object: "response",
    created_at: cc.created || Math.floor(Date.now() / 1000),
    status,
    model: model || cc.model,
    output,
    previous_response_id: previousResponseId || null,
    metadata: metadata || {},
    usage: translateUsage(cc.usage),
    incomplete_details: incompleteDetails,
  };
}

function buildStreamingResponseEvents(responseId, model, previousResponseId, metadata) {
  const baseResponse = {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "in_progress",
    model,
    output: [],
    previous_response_id: previousResponseId || null,
    metadata: metadata || {},
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
  return {
    created: () => `event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: baseResponse })}\n\n`,
    inProgress: () => `event: response.in_progress\ndata: ${JSON.stringify({ type: "response.in_progress", response: baseResponse })}\n\n`,
    outputItemAdded: (index, item) => `event: response.output_item.added\ndata: ${JSON.stringify({ type: "response.output_item.added", output_index: index, item })}\n\n`,
    contentPartAdded: (outIdx, contentIdx, part) => `event: response.content_part.added\ndata: ${JSON.stringify({ type: "response.content_part.added", output_index: outIdx, content_index: contentIdx, part })}\n\n`,
    textDelta: (outIdx, contentIdx, delta) => `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", output_index: outIdx, content_index: contentIdx, delta })}\n\n`,
    textDone: (outIdx, contentIdx, text) => `event: response.output_text.done\ndata: ${JSON.stringify({ type: "response.output_text.done", output_index: outIdx, content_index: contentIdx, text })}\n\n`,
    contentPartDone: (outIdx, contentIdx, part) => `event: response.content_part.done\ndata: ${JSON.stringify({ type: "response.content_part.done", output_index: outIdx, content_index: contentIdx, part })}\n\n`,
    outputItemDone: (outIdx, item) => `event: response.output_item.done\ndata: ${JSON.stringify({ type: "response.output_item.done", output_index: outIdx, item })}\n\n`,
    fnCallArgsDelta: (outIdx, callId, delta) => `event: response.function_call_arguments.delta\ndata: ${JSON.stringify({ type: "response.function_call_arguments.delta", output_index: outIdx, call_id: callId, delta })}\n\n`,
    fnCallArgsDone: (outIdx, callId, args) => `event: response.function_call_arguments.done\ndata: ${JSON.stringify({ type: "response.function_call_arguments.done", output_index: outIdx, call_id: callId, arguments: args })}\n\n`,
    completed: (response) => `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response })}\n\n`,
  };
}

function clientGone(res) {
  return res.destroyed || res.writableEnded;
}

function writeWithBackpressure(res, chunk) {
  if (clientGone(res)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const ok = res.write(chunk);
    if (ok) resolve(true);
    else res.once("drain", () => resolve(true));
  });
}

function wireClientCancel(res, onCancel) {
  const onClose = () => {
    try {
      const result = onCancel();
      if (result?.catch) result.catch(() => {});
    } catch { /* ignore */ }
  };
  res.on("close", onClose);
  return () => res.off("close", onClose);
}

function wireRequestAbort(req, controller) {
  if (!req || !controller) return () => {};
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  req.on("aborted", abort);
  req.on("close", abort);
  return () => {
    req.off("aborted", abort);
    req.off("close", abort);
  };
}

function isAbortError(err) {
  return err?.name === "AbortError" || err?.code === "ABORT_ERR";
}

async function sendCompletion(res, events, responseId, model, fullText, toolCalls, outputIndex, textOutputIdx, finishReason, usage, previousResponseId, metadata) {
  for (const [idx, tc] of toolCalls) {
    const tcIdx = tc.outputIdx != null ? tc.outputIdx : outputIndex + idx;
    await writeWithBackpressure(res, events.fnCallArgsDone(tcIdx, tc.callId, tc.arguments));
    await writeWithBackpressure(res, events.outputItemDone(tcIdx, {
      type: "function_call", id: tc.id, call_id: tc.callId, name: tc.name, arguments: tc.arguments, status: "completed",
    }));
  }

  const msgOutIdx = textOutputIdx >= 0 ? textOutputIdx : outputIndex + toolCalls.size;
  const trimmed = fullText.trim();
  if (trimmed) {
    const donePart = { type: "output_text", text: trimmed, annotations: [] };
    await writeWithBackpressure(res, events.textDone(msgOutIdx, 0, trimmed));
    await writeWithBackpressure(res, events.contentPartDone(msgOutIdx, 0, donePart));
    await writeWithBackpressure(res, events.outputItemDone(msgOutIdx, {
      type: "message", id: `msg_${uid()}`, status: "completed", role: "assistant", content: [donePart],
    }));
  }

  const outputItems = [];
  for (const [idx, tc] of toolCalls) {
    const tcIdx = tc.outputIdx != null ? tc.outputIdx : outputIndex + idx;
    outputItems.push({ sortIdx: tcIdx, item: { type: "function_call", id: tc.id, call_id: tc.callId, name: tc.name, arguments: tc.arguments, status: "completed" } });
  }
  if (trimmed) {
    outputItems.push({
      sortIdx: msgOutIdx,
      item: { type: "message", id: `msg_${uid()}`, status: "completed", role: "assistant", content: [{ type: "output_text", text: trimmed, annotations: [] }] },
    });
  }
  outputItems.sort((a, b) => a.sortIdx - b.sortIdx);
  const finalOutput = outputItems.map((o) => o.item);

  let status = "completed";
  let incompleteDetails = null;
  if (finishReason === "length") {
    status = "incomplete";
    incompleteDetails = { reason: "max_output_tokens" };
  }

  const finalResponse = {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status,
    model,
    output: finalOutput,
    previous_response_id: previousResponseId || null,
    metadata: metadata || {},
    usage: translateUsage(usage),
    incomplete_details: incompleteDetails,
  };
  await writeWithBackpressure(res, events.completed(finalResponse));
  return finalOutput;
}

async function handleStreamingResponse(upstreamRes, res, model, previousResponseId, metadata, { reader: existingReader } = {}) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const reader = existingReader || upstreamRes.body?.getReader();
  if (!reader) {
    if (!clientGone(res)) res.end();
    return { responseId: `resp_${uid()}`, output: [], reasoningContent: "" };
  }

  const cancelReader = () => reader.cancel().catch(() => {});
  const teardown = wireClientCancel(res, cancelReader);

  const responseId = `resp_${uid()}`;
  const events = buildStreamingResponseEvents(responseId, model, previousResponseId, metadata);
  await writeWithBackpressure(res, events.created());
  await writeWithBackpressure(res, events.inProgress());

  let fullText = "";
  let reasoningContent = "";
  let inThink = false;
  let messageStarted = false;
  let completionSent = false;
  const toolCalls = new Map();
  let outputIndex = 0;
  let textOutputIdx = -1;
  let buffer = "";
  let streamOutput = null;
  const decoder = new TextDecoder();

  const processLines = async (lines) => {
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        if (!completionSent) {
          completionSent = true;
          streamOutput = await sendCompletion(res, events, responseId, model, fullText, toolCalls, outputIndex, textOutputIdx, null, null, previousResponseId, metadata);
        }
        continue;
      }

      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }

      const delta = parsed.choices?.[0]?.delta;
      const finishReason = parsed.choices?.[0]?.finish_reason;
      if (!delta && !finishReason) continue;

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const tcOutIdx = (messageStarted && textOutputIdx === 0) ? outputIndex + idx + 1 : outputIndex + idx;
          if (!toolCalls.has(idx)) {
            const callId = tc.id || `call_${uid()}`;
            const fcId = `fc_${uid()}`;
            toolCalls.set(idx, { id: fcId, callId, name: tc.function?.name || "", arguments: "", outputIdx: tcOutIdx });
            await writeWithBackpressure(res, events.outputItemAdded(tcOutIdx, {
              type: "function_call", id: fcId, call_id: callId, name: tc.function?.name || "", arguments: "", status: "in_progress",
            }));
          }
          if (tc.function?.arguments) {
            const tcData = toolCalls.get(idx);
            tcData.arguments += tc.function.arguments;
            await writeWithBackpressure(res, events.fnCallArgsDelta(tcData.outputIdx, tcData.callId, tc.function.arguments));
          }
        }
        if (finishReason && !completionSent) {
          completionSent = true;
          streamOutput = await sendCompletion(res, events, responseId, model, fullText, toolCalls, outputIndex, textOutputIdx, finishReason, parsed.usage, previousResponseId, metadata);
        }
        continue;
      }

      if (typeof delta?.reasoning_content === "string") {
        reasoningContent += delta.reasoning_content;
        continue;
      }

      if (delta?.content) {
        let text = delta.content;
        if (text.includes("<think>")) { inThink = true; text = text.replace(/<think>/g, ""); }
        if (text.includes("</think>")) { inThink = false; text = text.replace(/<\/think>/g, ""); }
        if (inThink || !text) continue;

        if (!messageStarted) {
          messageStarted = true;
          textOutputIdx = outputIndex + toolCalls.size;
          await writeWithBackpressure(res, events.outputItemAdded(textOutputIdx, {
            type: "message", id: `msg_${uid()}`, status: "in_progress", role: "assistant", content: [],
          }));
          await writeWithBackpressure(res, events.contentPartAdded(textOutputIdx, 0, { type: "output_text", text: "", annotations: [] }));
        }
        fullText += text;
        await writeWithBackpressure(res, events.textDelta(textOutputIdx, 0, text));
      }

      if (finishReason && !completionSent) {
        completionSent = true;
        streamOutput = await sendCompletion(res, events, responseId, model, fullText, toolCalls, outputIndex, textOutputIdx, finishReason, parsed.usage, previousResponseId, metadata);
      }
    }
  };

  try {
    while (!clientGone(res)) {
      let readResult;
      try {
        readResult = await reader.read();
      } catch (err) {
        if (clientGone(res) || isAbortError(err)) break;
        throw err;
      }

      const { done, value } = readResult;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      await processLines(lines);
    }
  } catch (err) {
    if (!clientGone(res) && !isAbortError(err)) {
      log.warn("[proxy] stream read error:", err.message);
    }
  } finally {
    teardown();
    try { reader.releaseLock(); } catch { /* already released */ }
  }

  if (!completionSent && !clientGone(res)) {
    completionSent = true;
    const fallbackReason = (fullText.length > 0 || toolCalls.size > 0) ? "length" : "stop";
    streamOutput = await sendCompletion(res, events, responseId, model, fullText, toolCalls, outputIndex, textOutputIdx, fallbackReason, null, previousResponseId, metadata);
  }

  if (!clientGone(res)) res.end();
  return { responseId, output: streamOutput || [], reasoningContent };
}

// === HTTP helpers ===
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function fetchWithTimeout(url, opts, timeoutMs = UPSTREAM_TIMEOUT, externalSignal) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const onExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternal, { once: true });
  }
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
    externalSignal?.removeEventListener?.("abort", onExternal);
  }
}

async function sendUpstreamError(upstreamRes, res) {
  const text = await upstreamRes.text().catch(() => "");
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { error: { message: text || upstreamRes.statusText } }; }
  sendJson(res, upstreamRes.status, payload);
}

function upstreamHeaders(provider) {
  const isAgentRouter = provider.name === "agentrouter" || /agentrouter\.org/i.test(provider.baseUrl || "");
  const defaults = isAgentRouter ? AGENTROUTER_DEFAULT_HEADERS : {};
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
    ...defaults,
    ...(provider.headers || {}),
  };
}

async function testProvider(provider, model) {
  const testModel = resolveModelName(model || provider.models[0]);
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: upstreamHeaders(provider),
    body: JSON.stringify({
      model: testModel,
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 16,
      stream: false,
    }),
  }, 30000);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, model: testModel, body };
}

async function handleResponses(req, res, body) {
  const t0 = Date.now();
  const originalInput = body.input;
  const originalPreviousResponseId = body.previous_response_id || null;

  const binding = applyKeyBinding(body, req._localKeyEntry);
  if (!binding.ok) {
    sendJson(res, 403, { error: { message: binding.error } });
    recordRequest("none", body.model, false, Date.now() - t0);
    return;
  }
  body.model = binding.model;

  const route = resolveProvider(body.model);
  if (route.error) {
    sendJson(res, 400, { error: { message: route.error } });
    recordRequest("none", body.model, false, Date.now() - t0);
    return;
  }

  const { provider, model, fallback } = route;
  if (!provider.apiKey) {
    sendJson(res, 400, { error: { message: `Provider "${provider.name}" has no apiKey configured` } });
    recordRequest(provider.name, model, false, Date.now() - t0);
    return;
  }

  body.model = model;
  maybeResolvePreviousResponseChain(body);

  const thinkingStyle = provider.thinkingStyle || "passthrough";
  const chatReq = responsesRequestToChatCompletions(body, thinkingStyle);

  const norm = normalizeModelId(chatReq.model);
  const isProviderModel = provider.models.some((m) => normalizeModelId(m) === norm);
  if (!isProviderModel && provider.models.length > 0) {
    chatReq.model = provider.models[0];
  }

  const upstreamUrl = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const isStream = !!chatReq.stream;

  log.info(`[proxy] ${provider.name}(${chatReq.model}) stream=${isStream} fallback=${!!fallback}`);

  const clientAbort = isStream ? new AbortController() : null;
  const detachClient = clientAbort ? wireRequestAbort(req, clientAbort) : () => {};

  try {
    const upstreamRes = await fetchWithTimeout(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders(provider),
      body: JSON.stringify(chatReq),
    }, UPSTREAM_TIMEOUT, clientAbort?.signal);

    if (!upstreamRes.ok) {
      await sendUpstreamError(upstreamRes, res);
      recordRequest(provider.name, chatReq.model, false, Date.now() - t0);
      return;
    }

    if (isStream) {
      try {
        const { responseId, output, reasoningContent } = await handleStreamingResponse(
          upstreamRes, res, body.model, originalPreviousResponseId, body.metadata
        );
        storeResponse(responseId, {
          provider: provider.name,
          input: originalInput,
          output,
          previousResponseId: originalPreviousResponseId,
          reasoningContent: reasoningContent || "",
        });
        recordRequest(provider.name, chatReq.model, true, Date.now() - t0);
      } catch (err) {
        if (!isAbortError(err)) log.error("[proxy] stream error:", err.message);
        if (!res.headersSent) {
          sendJson(res, 502, { error: { message: err.message } });
        } else if (!clientGone(res)) {
          res.end();
        }
        recordRequest(provider.name, chatReq.model, false, Date.now() - t0);
      }
      return;
    }

    const ccResponse = await upstreamRes.json();
    const responsesResponse = chatCompletionToResponse(ccResponse, body.model, originalPreviousResponseId, body.metadata);
    const reasoningContent = ccResponse.choices?.[0]?.message?.reasoning_content || "";
    storeResponse(responsesResponse.id, {
      provider: provider.name,
      input: originalInput,
      output: responsesResponse.output,
      previousResponseId: originalPreviousResponseId,
      reasoningContent,
    });
    sendJson(res, 200, responsesResponse);
    recordRequest(provider.name, chatReq.model, true, Date.now() - t0);
  } catch (err) {
    log.error("[proxy] upstream error:", err.message);
    sendJson(res, 502, { error: { message: err.message } });
    recordRequest(provider.name, chatReq.model, false, Date.now() - t0);
  } finally {
    detachClient();
  }
}

// === Web console HTML ===
function consoleHtml() {
  const consolePath = path.join(__dirname, "console.html");
  if (fs.existsSync(consolePath)) {
    return fs.readFileSync(consolePath, "utf8");
  }
  return "<html><body><h1>console.html not found</h1></body></html>";
}

// === Request router ===
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    });
    return res.end();
  }

  if (pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      uptimeSec: Math.floor((Date.now() - stats.startedAt) / 1000),
      port: boundPort,
      providers: getConfig().providers.map((p) => p.name),
    });
  }

  if (pathname === "/stats") {
    return sendJson(res, 200, {
      ...stats,
      storeSize: responseStore.size,
      configPath: CONFIG_PATH,
    });
  }

  if (pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(consoleHtml());
  }

  if (pathname === "/config" && req.method === "GET") {
    return sendJson(res, 200, publicConfig(getConfig()));
  }

  if (pathname === "/config" && req.method === "POST") {
    try {
      const incoming = await readJsonBody(req);
      const current = getConfig();
      const merged = {
        ...current,
        ...incoming,
        providers: (incoming.providers || current.providers).map((p) => {
          const prev = current.providers.find((x) => x.name === p.name);
          const merged = { ...p };
          if (!p.apiKey || isMaskedKey(p.apiKey)) {
            if (prev?.apiKey) merged.apiKey = prev.apiKey;
          }
          if (!p.headers || Object.keys(p.headers).length === 0) {
            merged.headers = prev?.headers || {};
          } else {
            merged.headers = { ...(prev?.headers || {}), ...p.headers };
          }
          return merged;
        }),
      };
      if (incoming.localKeys !== undefined) {
        merged.localKeys = mergeLocalKeys(incoming.localKeys, current.localKeys);
      } else if (incoming.localKey) {
        merged.localKeys = mergeLocalKeys([{ key: incoming.localKey }], current.localKeys);
      } else {
        merged.localKeys = getLocalKeyEntries(current);
      }
      delete merged.localKey;
      const result = setConfig(merged);
      if (!result.ok) return sendJson(res, 400, { errors: result.errors });
      return sendJson(res, 200, { ok: true, portChanged: result.portChanged });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  if (pathname === "/test" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const name = body.provider?.name;
      const current = getConfig().providers.find((x) => x.name === name);
      const p = body.provider || {};
      const provider = {
        ...(current || {}),
        ...p,
        apiKey: p.apiKey || current?.apiKey || "",
        baseUrl: p.baseUrl || current?.baseUrl || "",
        models: p.models?.length ? p.models : (current?.models || []),
        headers: { ...(current?.headers || {}), ...(p.headers || {}) },
      };
      if (!provider.baseUrl) return sendJson(res, 400, { error: "provider required" });
      if (!provider.apiKey) return sendJson(res, 400, { error: "apiKey required" });
      const result = await testProvider(provider, body.model);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 502, { ok: false, error: err.message });
    }
  }

  if (!checkAuth(req, pathname)) {
    return sendJson(res, 401, { error: { message: "Unauthorized" } });
  }

  if (pathname === "/v1/models" && req.method === "GET") {
    return sendJson(res, 200, { object: "list", data: listAllModels() });
  }

  if (pathname === "/v1/responses" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      if (!body.model) return sendJson(res, 400, { error: { message: "model is required" } });

      // Codex health probe: empty input without previous_response_id
      const hasInput = body.input != null && body.input !== "" && !(Array.isArray(body.input) && body.input.length === 0);
      const hasPrevious = !!body.previous_response_id;
      if (!hasInput && !hasPrevious) {
        return sendJson(res, 200, {
          id: `resp_${uid()}`,
          object: "response",
          status: "completed",
          model: body.model,
          output: [],
          previous_response_id: null,
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        });
      }

      return await handleResponses(req, res, body);
    } catch (err) {
      return sendJson(res, 400, { error: { message: err.message } });
    }
  }

  sendJson(res, 404, { error: { message: "Not found" } });
}

// === Boot ===
function startServer() {
  runtimeConfig = loadConfigFromDisk();
  boundPort = runtimeConfig.port;

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      log.error("[proxy] handler error:", err);
      if (!res.headersSent) sendJson(res, 500, { error: { message: "Internal error" } });
    });
  });

  server.listen(boundPort, "127.0.0.1", () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║         Codex Responses Proxy                         ║
║         http://127.0.0.1:${String(boundPort).padEnd(5)}  (config UI)          ║
╚═══════════════════════════════════════════════════════╝
`);
    log.info(`[proxy] listening on http://127.0.0.1:${boundPort}`);
    log.info(`[proxy] config: ${CONFIG_PATH}`);
  });

  server.on("error", (err) => {
    log.error("[proxy] server error:", err.message);
    process.exit(1);
  });
}

startServer();
