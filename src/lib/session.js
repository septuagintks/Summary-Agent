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

export const Session = {
  available() {
    return !!(chrome.storage && chrome.storage.session);
  },

  async getHistory(tabId) {
    if (!this.available() || tabId == null) return [];
    const key = historyKey(tabId);
    const result = await chrome.storage.session.get(key);
    return result[key] || [];
  },

  async addToHistory(tabId, entry) {
    if (!this.available() || tabId == null) return null;

    const history = await this.getHistory(tabId);
    const newEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      url: entry.url || "",
      title: entry.title || "",
      response: entry.response || "",
      contentLength: entry.contentLength || 0,
    };

    const updated = [newEntry, ...history].slice(0, MAX_HISTORY_PER_TAB);
    await chrome.storage.session.set({ [historyKey(tabId)]: updated });
    return newEntry.id;
  },

  async clearHistory(tabId) {
    if (!this.available() || tabId == null) return;
    await chrome.storage.session.remove(historyKey(tabId));
  },

  async getExtractedContent(tabId, url) {
    if (!this.available() || tabId == null) return null;

    const key = extractKey(tabId);
    const result = await chrome.storage.session.get(key);
    const cached = result[key];

    if (!cached) return null;
    if (cached.url !== url) return null;
    if (Date.now() - cached.timestamp > EXTRACT_CACHE_TTL_MS) return null;

    return cached.content;
  },

  async cacheExtractedContent(tabId, url, content) {
    if (!this.available() || tabId == null) return;
    await chrome.storage.session.set({
      [extractKey(tabId)]: { url, content, timestamp: Date.now() },
    });
  },

  async invalidateExtractCache(tabId) {
    if (!this.available() || tabId == null) return;
    await chrome.storage.session.remove(extractKey(tabId));
  },

  async clearTabData(tabId) {
    if (!this.available() || tabId == null) return;
    await chrome.storage.session.remove([historyKey(tabId), extractKey(tabId)]);
  },
};
