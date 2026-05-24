import { Cfg } from "./lib/storage.js";
import {
  detectProvider,
  buildRequest,
  splitSseEvents,
  processSseEvent,
  parseFullResponse,
} from "./lib/providers.js";
import {
  ApiError,
  ErrorCodes,
  classifyHttpError,
  classifyNetworkError,
} from "./lib/errors.js";
import { Session } from "./lib/session.js";

// Streaming AI calls in MV3:
self.addEventListener("error", (e) => {
  ErrorLogger.log(e.error || new Error(e.message), { source: "background_error" });
});
self.addEventListener("unhandledrejection", (e) => {
  ErrorLogger.log(e.reason || new Error("Unhandled Rejection"), { source: "background_unhandledrejection" });
});

//   content script  ──(port: "ai-call")──▶  service worker
//                    chunk / done / error / retry
//   service worker  ──(fetch + ReadableStream)──▶  provider
//
// One port per call. Disconnect aborts via AbortController.

const MAX_RETRIES = 3;
const tabLoadStatus = new Map();

chrome.tabs?.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.status) return;
  tabLoadStatus.set(tabId, changeInfo.status);
  if (changeInfo.status === "complete") {
    chrome.tabs.sendMessage(tabId, { type: "tab-status", status: "complete" }).catch(() => {});
  }
});

chrome.tabs?.onRemoved.addListener((tabId) => {
  tabLoadStatus.delete(tabId);
  Session.clearTabData(tabId).catch(() => {});
});

chrome.tabs?.onUpdated.addListener((tabId, changeInfo) => {
  // Invalidate extract cache when URL changes (navigation)
  if (changeInfo.url) {
    Session.invalidateExtractCache(tabId).catch(() => {});
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ai-call") return;

  const controller = new AbortController();
  let aborted = false;

  port.onDisconnect.addListener(() => {
    aborted = true;
    controller.abort();
  });

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== "start") return;
    try {
      await runCall(msg.messages || [], port, controller.signal, msg.options || {});
    } catch (err) {
      if (!aborted) {
        ErrorLogger.log(err, { type: ai-call });
        const apiErr = err instanceof ApiError ? err : classifyNetworkError(err);
        safePost(port, {
          type: "error",
          error: apiErr.message,
          code: apiErr.code,
          retryable: apiErr.retryable,
        });
      }
    }
  });
});

function safePost(port, msg) {
  try { port.postMessage(msg); } catch {}
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      }, { once: true });
    }
  });
}

// Exponential backoff with jitter: 1s, 2s, 4s + random 0-500ms.
function backoffDelay(attempt) {
  const base = Math.pow(2, attempt - 1) * 1000;
  const jitter = Math.random() * 500;
  return base + jitter;
}

async function fetchWithRetry(req, signal, port, retryEnabled) {
  let lastError;
  const maxAttempts = retryEnabled ? MAX_RETRIES : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      safePost(port, {
        type: "retry",
        attempt,
        maxAttempts,
      });
    }

    try {
      const res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: req.body,
        signal,
      });

      if (res.ok) return { ok: true, response: res };

      const text = await res.text().catch(() => "");
      const error = classifyHttpError(res.status, text);
      lastError = error;

      if (!error.retryable || attempt === maxAttempts) {
        return { ok: false, error };
      }

      await sleep(backoffDelay(attempt), signal);

    } catch (e) {
      if (signal.aborted) throw e;

      const error = classifyNetworkError(e);
      lastError = error;

      if (!error.retryable || attempt === maxAttempts) {
        return { ok: false, error };
      }

      await sleep(backoffDelay(attempt), signal);
    }
  }

  return { ok: false, error: lastError };
}

async function runCall(messages, port, signal, options = {}) {
  const cfg = await Cfg.get();
  const retryEnabled = options.retry !== false;

  // Expand placeholders to check if key is actually provided
  const finalUrl = cfg.apiUrl.replace("{key}", cfg.apiKey || "").replace("{model}", cfg.model || "");
  if (!cfg.apiKey || finalUrl.includes("{key}")) {
    safePost(port, {
      type: "error",
      error: "API Key not set, please open settings to configure",
      code: ErrorCodes.CONFIG_ERROR,
      retryable: false,
    });
    return;
  }

  const customProviders = await Cfg.getCustomProviders();
  const matchedCustom = customProviders.find((c) => c.url === cfg.apiUrl);
  const compatOverride = matchedCustom?.compat || "";

  const provider = detectProvider(cfg.apiUrl, cfg.model, compatOverride);
  const req = buildRequest(cfg, messages, compatOverride);

  const fetchResult = await fetchWithRetry(req, signal, port, retryEnabled);
  if (!fetchResult.ok) {
    if (signal.aborted) return;
    safePost(port, {
      type: "error",
      error: fetchResult.error.message,
      code: fetchResult.error.code,
      retryable: fetchResult.error.retryable,
      statusCode: fetchResult.error.statusCode,
    });
    return;
  }

  const res = fetchResult.response;

  if (!cfg.stream) {
    const text = await res.text();
    const full = parseFullResponse(provider, text);
    safePost(port, { type: "chunk", text: full });
    safePost(port, { type: "done", text: full });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    safePost(port, {
      type: "error",
      error: "Streaming not supported by response",
      code: ErrorCodes.NETWORK_ERROR,
      retryable: false,
    });
    return;
  }

  const decoder = new TextDecoder();
  let streamBuffer = "";
  let fullText = "";
  let doneSeen = false;

  while (true) {
    let result;
    try {
      result = await reader.read();
    } catch (e) {
      if (signal.aborted) return;
      safePost(port, {
        type: "error",
        error: "Stream read error",
        code: ErrorCodes.STREAM_READ_ERROR,
        retryable: true,
      });
      return;
    }
    if (result.done) break;
    streamBuffer += decoder.decode(result.value, { stream: true });

    const { events, rest } = splitSseEvents(streamBuffer);
    streamBuffer = rest;

    for (const event of events) {
      const finished = processSseEvent(provider, event, (delta) => {
        fullText += delta;
        safePost(port, { type: "chunk", text: fullText });
      });
      if (finished) { doneSeen = true; break; }
    }
    if (doneSeen) break;
  }

  if (!doneSeen && streamBuffer) {
    const { events } = splitSseEvents(streamBuffer, true);
    for (const event of events) {
      processSseEvent(provider, event, (delta) => {
        fullText += delta;
        safePost(port, { type: "chunk", text: fullText });
      });
    }
  }

  safePost(port, { type: "done", text: fullText });
}

// Open options page from popup / context menu helpers + history operations.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "open-options") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "content-ready-state") {
    const tabId = sender.tab?.id;
    sendResponse({
      ok: true,
      tabStatus: sender.tab?.status || (tabId != null ? tabLoadStatus.get(tabId) : undefined) || "unknown",
    });
    return true;
  }
  if (msg?.type === "history-get") {
    const tabId = sender.tab?.id;
    Session.getHistory(tabId).then((history) => {
      sendResponse({ ok: true, history });
    });
    return true;
  }
  if (msg?.type === "history-add") {
    const tabId = sender.tab?.id;
    Session.addToHistory(tabId, msg.entry || {}).then((id) => {
      sendResponse({ ok: true, id });
    });
    return true;
  }
  if (msg?.type === "history-clear") {
    const tabId = sender.tab?.id;
    Session.clearHistory(tabId).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg?.type === "extract-cache-get") {
    const tabId = sender.tab?.id;
    Session.getExtractedContent(tabId, msg.url).then((content) => {
      sendResponse({ ok: true, content });
    });
    return true;
  }
  if (msg?.type === "extract-cache-set") {
    const tabId = sender.tab?.id;
    Session.cacheExtractedContent(tabId, msg.url, msg.content).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  // Migrate old key autoSummarizeOnOpen -> summarizeMode.
  try {
    const got = await chrome.storage.local.get(["autoSummarizeOnOpen", "summarizeMode"]);
    if (got.summarizeMode == null && got.autoSummarizeOnOpen != null) {
      await chrome.storage.local.set({
        summarizeMode: got.autoSummarizeOnOpen ? "on-open" : "off",
      });
      await chrome.storage.local.remove("autoSummarizeOnOpen");
    }
  } catch {}

  try {
    chrome.contextMenus.create({
      id: "summary-agent-run",
      title: "AI summarize this page",
      contexts: ["page"],
    });
  } catch {}
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "summary-agent-run" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "open-and-summarize" }).catch(() => {});
  }
});
