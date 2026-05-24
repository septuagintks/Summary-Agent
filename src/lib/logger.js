export class ErrorLogger {
  static async log(error, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      message: error.message || String(error),
      stack: error.stack,
      code: error.code,
      context,
      version: "unknown",
      userAgent: "unknown"
    };
    
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
        entry.version = chrome.runtime.getManifest().version;
      }
    } catch {}

    try {
      if (typeof navigator !== "undefined") {
        entry.userAgent = navigator.userAgent;
      }
    } catch {}

    try {
      const logs = await chrome.storage.local.get('error_logs');
      const list = logs.error_logs || [];
      list.unshift(entry);
      await chrome.storage.local.set({
        error_logs: list.slice(0, 50)
      });
    } catch (e) {
      console.error("Failed to write to error logs:", e);
    }
  }
  
  static async getLogs() {
    try {
      const logs = await chrome.storage.local.get('error_logs');
      return logs.error_logs || [];
    } catch {
      return [];
    }
  }
  
  static async clearLogs() {
    try {
      await chrome.storage.local.remove('error_logs');
    } catch {}
  }
}

