import { DEFAULTS } from "./defaults.js";

const KEYS = Object.keys(DEFAULTS);

export const Cfg = {
  async get() {
    const stored = await chrome.storage.local.get(KEYS);
    const out = {};
    for (const k of KEYS) out[k] = stored[k] ?? DEFAULTS[k];
    return out;
  },
  async set(obj) {
    await chrome.storage.local.set(obj);
  },
  async reset() {
    // Clear provider-specific keys before resetting to defaults
    const all = await chrome.storage.local.get(null);
    const providerKeys = Object.keys(all).filter(k => k.startsWith("apiKey_"));
    if (providerKeys.length > 0) {
      await chrome.storage.local.remove(providerKeys);
    }
    await chrome.storage.local.set({ ...DEFAULTS });
  },
  async getProviderKey(presetId) {
    const k = "apiKey_" + presetId;
    const v = await chrome.storage.local.get(k);
    return v[k] || "";
  },
  async setProviderKey(presetId, key) {
    await chrome.storage.local.set({ ["apiKey_" + presetId]: key });
  },
  async getFabPosition() {
    const v = await chrome.storage.local.get("fab_position");
    return v.fab_position || null;
  },
  async setFabPosition(pos) {
    await chrome.storage.local.set({ fab_position: pos });
  },
};
