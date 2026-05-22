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
    await chrome.storage.local.set({ ["apiKey_" + presetId]: key });
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
