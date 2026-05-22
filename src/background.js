import { Cfg } from "./lib/storage.js";
import {
  detectProvider,
  buildRequest,
  splitSseEvents,
  processSseEvent,
  parseFullResponse,
} from "./lib/providers.js";

// Streaming AI calls in MV3:
//   content script  ──(port: "ai-call")──▶  service worker
//                    chunk / done / error
//   service worker  ──(fetch + ReadableStream)──▶  provider
//
// One port per call. Disconnect aborts via AbortController.

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
      await runCall(msg.messages || [], port, controller.signal);
    } catch (err) {
      if (!aborted) safePost(port, { type: "error", error: String(err?.message || err) });
    }
  });
});

function safePost(port, msg) {
  try { port.postMessage(msg); } catch {}
}

async function runCall(messages, port, signal) {
  const cfg = await Cfg.get();
  if (!cfg.apiKey && !cfg.apiUrl.includes("{key}")) {
    safePost(port, { type: "error", error: "API Key not set, please open settings to configure" });
    return;
  }

  const provider = detectProvider(cfg.apiUrl, cfg.model);
  const req = buildRequest(cfg, messages);

  let res;
  try {
    res = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      signal,
    });
  } catch (e) {
    if (signal.aborted) return;
    safePost(port, { type: "error", error: "Network error, please check API address and network connection" });
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text).error?.message || msg; } catch {}
    safePost(port, { type: "error", error: msg });
    return;
  }

  if (!cfg.stream) {
    const text = await res.text();
    const full = parseFullResponse(provider, text);
    safePost(port, { type: "chunk", text: full });
    safePost(port, { type: "done", text: full });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    safePost(port, { type: "error", error: "Streaming not supported by response" });
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
      safePost(port, { type: "error", error: "Stream read error" });
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

// Open options page from popup / context menu helpers.
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
