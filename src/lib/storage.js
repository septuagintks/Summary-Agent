import { DEFAULTS } from "./defaults.js";

// M20: Storage schema version.
const STORAGE_VERSION = 1;
const STORAGE_VERSION_KEY = "_storage_version";

const KEYS = Object.keys(DEFAULTS);

export const Cfg = {
  async get() {
    const stored = await chrome.storage.local.get(KEYS);
    // M20: Run storage migration if version is out of date.
    await migrateStorage(stored);

    // M19: Warn if deprecated config keys are still present.
    const deprecatedKeys = ["autoSummarizeOnOpen"];
    for (const dk of deprecatedKeys) {
      if (stored[dk] !== undefined) {
        console.warn("[Summary Agent] Config key \"" + dk + "\" is deprecated. Run the extension once to auto-migrate it.");
      }
    }
    const out = {};
    for (const k of KEYS) out[k] = stored[k] ?? DEFAULTS[k];
    return out;
  },
  async set(obj) {
    await chrome.storage.local.set(obj);
    // M17: Warn when storage usage is high.
    try {
      if (navigator?.storage?.estimate) {
        const est = await navigator.storage.estimate();
        const usedMB = (est.usage || 0) / (1024 * 1024);
        const quotaMB = (est.quota || 10 * 1024 * 1024) / (1024 * 1024);
        if (usedMB > quotaMB * 0.8) {
          console.warn(
            "[Summary Agent] Storage at " + usedMB.toFixed(1) + " MB (" +
            (usedMB / quotaMB * 100).toFixed(0) + "% of ~" + quotaMB.toFixed(0) + " MB quota). " +
            "Consider clearing error logs or resetting settings."
          );
        }
      }
    } catch () {}
  },
  async reset() {
    // Preserve provider API keys across reset; users have asked us not to
    // wipe credentials when restoring defaults.
    await chrome.storage.local.set({ ...DEFAULTS });
  },
  async getProviderKey(presetId) {
    const k = "apiKey_" + presetId;
    const v = await chrome.storage.local.get(k);
    return v[k] || "";
  },
  async setProviderKey(presetId, key) {
    // Basic format validation
    if (!key || key.trim().length < 10) {
      throw new Error("API Key too short");
    }

    // Preset-specific key format patterns
    const patterns = {
      openai: /^sk-[a-zA-Z0-9]{32,}$/,
      anthropic: /^sk-ant-[a-zA-Z0-9-]{32,}$/,
      gemini: /^[a-zA-Z0-9_-]{32,}$/,
    };

    const pattern = patterns[presetId];
    if (pattern && !pattern.test(key.trim())) {
      throw new Error(`Invalid API Key format for ${presetId}`);
    }

    await chrome.storage.local.set({ ["apiKey_" + presetId]: key.trim() });
  },
  async getFabPosition() {
    const v = await chrome.storage.local.get("fab_position");
    return v.fab_position || null;
  },
  async setFabPosition(pos) {
    await chrome.storage.local.set({ fab_position: pos });
  },
  // Custom providers — stored separately so they survive reset() and so
  // multiple entries can be added without bloating DEFAULTS.
  async getCustomProviders() {
    const v = await chrome.storage.local.get("custom_providers");
    return Array.isArray(v.custom_providers) ? v.custom_providers : [];
  },
  async setCustomProviders(list) {
    await chrome.storage.local.set({ custom_providers: list });
  },
  // Per-preset model-list overrides. Built-in PRESETS each ship a default
  // model dropdown; users can add or remove entries and we persist the
  // edited list under "models_<presetId>". Returns null when the preset
  // has no override (so callers can fall back to the built-in list).
  async getPresetModels(presetId) {
    if (!presetId) return null;
    const k = "models_" + presetId;
    const v = await chrome.storage.local.get(k);
    return Array.isArray(v[k]) ? v[k] : null;
  },
  async setPresetModels(presetId, list) {
    if (!presetId) return;
    await chrome.storage.local.set({ ["models_" + presetId]: list });
  },
  async clearPresetModels(presetId) {
    if (!presetId) return;
    await chrome.storage.local.remove("models_" + presetId);
  },
  // Per-preset URL overrides. Built-in PRESETS ship with a default URL;
  // users can edit it on the main form and we persist the override under
  // "url_<presetId>". Returns null when no override exists.
  async getPresetUrl(presetId) {
    if (!presetId) return null;
    const k = "url_" + presetId;
    const v = await chrome.storage.local.get(k);
    return typeof v[k] === "string" ? v[k] : null;
  },
  async setPresetUrl(presetId, url) {
    if (!presetId) return;
    await chrome.storage.local.set({ ["url_" + presetId]: url });
  },
  async clearPresetUrl(presetId) {
    if (!presetId) return;
    await chrome.storage.local.remove("url_" + presetId);
  },
};


// M20: Migrate storage from older versions to the current schema.
// Idempotent: only acts when _storage_version is absent or < current.
async function migrateStorage(stored) {
  const currentVersion = stored[STORAGE_VERSION_KEY];
  if (currentVersion === STORAGE_VERSION) return;

  // version 0 -> 1: rename autoSummarizeOnOpen -> summarizeMode
  if (currentVersion == null && stored.autoSummarizeOnOpen != null) {
    if (stored.summarizeMode == null) {
      stored.summarizeMode = stored.autoSummarizeOnOpen ? "on-open" : "off";
      await chrome.storage.local.set({ summarizeMode: stored.summarizeMode });
    }
    await chrome.storage.local.remove("autoSummarizeOnOpen");
  }

  await chrome.storage.local.set({ [STORAGE_VERSION_KEY]: STORAGE_VERSION });
  if (currentVersion == null) {
    console.log("[Summary Agent] Storage migrated to v" + STORAGE_VERSION);
  }
}
