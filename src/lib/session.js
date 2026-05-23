// Session storage layer using chrome.storage.session.
// Data lives only for the browser session (cleared on browser close)
// and is isolated per-tab via tabId-keyed entries.
//
// Requires Chrome 120+ for chrome.storage.session.

const MAX_HISTORY_PER_TAB = 10;
const EXTRACT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function historyKey(tabId) {
  return `history_${tabId}`;
}

function extractKey(tabId) {
  return `extract_${tabId}`;
}

// Validate that tabId is a positive integer.
function validateTabId(tabId) {
  return typeof tabId === "number" && tabId > 0 && Number.isInteger(tabId);
}

// Validate an entry object for history storage.
function validateHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.url && typeof entry.url !== "string") return false;
  if (entry.title && typeof entry.title !== "string") return false;
  if (entry.response && typeof entry.response !== "string") return false;
  if (entry.contentLength != null && (typeof entry.contentLength !== "number" || !Number.isFinite(entry.contentLength))) return false;
  return true;
}

// Validate extracted content cache structure.
function validateExtractCache(cached) {
  if (!cached || typeof cached !== "object") return false;
  if (typeof cached.url !== "string") return false;
  if (typeof cached.content !== "string") return false;
  if (typeof cached.timestamp !== "number") return false;
  return true;
}

export const Session = {
  available() {
    return !!(chrome.storage && chrome.storage.session);
  },

  async getHistory(tabId) {
    if (!this.available()) return [];
    if (!validateTabId(tabId)) return [];
    const key = historyKey(tabId);
    const result = await chrome.storage.session.get(key);
    const data = result[key];
    if (!Array.isArray(data)) return [];
    // Filter out invalid entries
    return data.filter((e) => validateHistoryEntry(e));
  },

  async addToHistory(tabId, entry) {
    if (!this.available()) return null;
    if (!validateTabId(tabId)) return null;
    if (!validateHistoryEntry(entry)) return null;

    const history = await this.getHistory(tabId);
    const newEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      url: typeof entry.url === "string" ? entry.url : "",
      title: typeof entry.title === "string" ? entry.title : "",
      response: typeof entry.response === "string" ? entry.response : "",
      contentLength: typeof entry.contentLength === "number" && Number.isFinite(entry.contentLength) ? entry.contentLength : 0,
    };

    const updated = [newEntry, ...history].slice(0, MAX_HISTORY_PER_TAB);
    await chrome.storage.session.set({ [historyKey(tabId)]: updated });
    return newEntry.id;
  },

  async clearHistory(tabId) {
    if (!this.available()) return;
    if (!validateTabId(tabId)) return;
    await chrome.storage.session.remove(historyKey(tabId));
  },

  async getExtractedContent(tabId, url) {
    if (!this.available()) return null;
    if (!validateTabId(tabId)) return null;
    if (typeof url !== "string" || !url) return null;

    const key = extractKey(tabId);
    const result = await chrome.storage.session.get(key);
    const cached = result[key];

    if (!validateExtractCache(cached)) return null;
    if (cached.url !== url) return null;
    if (Date.now() - cached.timestamp > EXTRACT_CACHE_TTL_MS) return null;

    return cached.content;
  },

  async cacheExtractedContent(tabId, url, content) {
    if (!this.available()) return;
    if (!validateTabId(tabId)) return;
    if (typeof url !== "string" || !url) return;
    if (typeof content !== "string") return;

    await chrome.storage.session.set({
      [extractKey(tabId)]: { url, content, timestamp: Date.now() },
    });
  },

  async invalidateExtractCache(tabId) {
    if (!this.available()) return;
    if (!validateTabId(tabId)) return;
    await chrome.storage.session.remove(extractKey(tabId));
  },

  async clearTabData(tabId) {
    if (!this.available()) return;
    if (!validateTabId(tabId)) return;
    await chrome.storage.session.remove([historyKey(tabId), extractKey(tabId)]);
  },
};
