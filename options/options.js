import { DEFAULTS, PRESETS } from "../src/lib/defaults.js";
import { Cfg } from "../src/lib/storage.js";
import { SUPPORTED_LANGS, LANG_LABELS, makeT } from "../src/lib/i18n.js";
import { completeUrlForCompat } from "../src/lib/providers.js";

const $ = (id) => document.getElementById(id);

let currentLang = "en";
let currentMode = "off";
let currentPresetId = null;
let customProviders = [];
let editingId = null;
// In-memory cache of the effective model list per preset id. Built by
// merging the built-in preset's models with the user's saved override
// from chrome.storage.local (`models_<presetId>`). Custom providers
// store their list directly on the entry's `models` field instead.
const presetModelsCache = new Map();
// In-memory cache of the effective URL per preset id. Built-in presets
// check for a user override in chrome.storage.local (`url_<presetId>`)
// before falling back to the preset's default URL. Custom providers
// store their URL directly on the entry's `url` field.
const presetUrlCache = new Map();
// "Uncommitted custom model name" per custom provider id. When a custom
// provider is active and the user has typed a model name into f-model
// that isn't yet in that provider's list (i.e. they haven't pressed +),
// switching away stashes the value here so coming back restores it.
// Built-in presets don't get drafts — their input always clears on
// switch, per the requested UX.
const customDraftModels = new Map();
let t = makeT(currentLang);

const EYE_SHOW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_HIDE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.77 19.77 0 0 1-3.16 4.19"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function allPresets() {
  return [...PRESETS, ...customProviders];
}

function applyI18n() {
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  document.title = t("opt.title");
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.dataset.i18n;
    const text = t(key);
    if (text != null) el.textContent = text;
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const text = t(el.dataset.i18nPlaceholder);
    if (text != null) el.placeholder = text;
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const text = t(el.dataset.i18nTitle);
    if (text != null) {
      el.title = text;
      el.setAttribute("aria-label", text);
    }
  }
  setModeHint(currentMode);
  // Refresh model-dropdown localized "Custom" label
  const sel = $("f-model-quick");
  if (sel) populateModelDropdown(currentPresetId, $("f-model").value.trim());
  // Re-render preset chips so their localized tooltips update.
  if ($("presets")) renderPresets();
  // Refresh eye titles (they depend on aria-pressed state).
  refreshEyeTitle($("f-key-eye"));
  refreshEyeTitle($("cp-key-eye"));
}

function setLanguage(lang) {
  currentLang = SUPPORTED_LANGS.includes(lang) ? lang : "en";
  t = makeT(currentLang);
  applyI18n();
}

function renderLanguageOptions() {
  const sel = $("f-lang");
  sel.innerHTML = "";
  for (const code of SUPPORTED_LANGS) {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = LANG_LABELS[code];
    sel.appendChild(o);
  }
}

function setMode(mode) {
  currentMode = mode;
  for (const btn of document.querySelectorAll("#f-mode .seg")) {
    btn.classList.toggle("active", btn.dataset.value === mode);
    btn.setAttribute("aria-checked", btn.dataset.value === mode ? "true" : "false");
  }
  setModeHint(mode);
}
function setModeHint(mode) {
  const key = mode === "on-open" ? "opt.mode.hint.onOpen" :
              mode === "implicit" ? "opt.mode.hint.implicit" :
              "opt.mode.hint.off";
  $("f-mode-hint").textContent = t(key);
}

async function fillForm(cfg) {
  $("f-url").value = cfg.apiUrl ?? "";
  $("f-key").value = cfg.apiKey ?? "";
  $("f-model").value = cfg.model ?? "";
  $("f-tokens").value = cfg.maxTokens ?? 2048;
  $("f-maxlen").value = cfg.maxContentLength ?? 16000;
  $("f-temp").value = cfg.temperature ?? 0.7;
  $("f-stream").checked = !!cfg.stream;
  $("f-sys").value = cfg.systemPrompt ?? "";
  $("f-prompt").value = cfg.userPrompt ?? "";
  setMode(cfg.summarizeMode || "off");
  $("f-lang").value = cfg.language || "en";
  currentPresetId = detectPresetFromUrl(cfg.apiUrl);
  if (currentPresetId) {
    await loadModelsFor(currentPresetId);
    // Load the effective URL (with override) so the form reflects what's
    // actually stored, not just the preset's default.
    const effectiveUrl = await loadUrlFor(currentPresetId);
    $("f-url").value = effectiveUrl;
  }
  setLanguage(cfg.language || "en");
  populateModelDropdown(currentPresetId, $("f-model").value.trim());
  updateCustomTools();
}

function detectPresetFromUrl(url) {
  return allPresets().find((p) => p.url === url)?.id || null;
}

// Return the effective model list for the active preset. For built-in
// presets we merge the preset's defaults with any user override saved in
// `models_<presetId>`; for custom providers we read the entry's `models`
// field directly. The merged list lives in `presetModelsCache` so calls
// during a render pass are cheap.
async function loadModelsFor(presetId) {
  if (!presetId) return [];
  if (presetModelsCache.has(presetId)) return presetModelsCache.get(presetId);

  const customMatch = customProviders.find((c) => c.id === presetId);
  if (customMatch) {
    const list = Array.isArray(customMatch.models) ? [...customMatch.models] : [];
    presetModelsCache.set(presetId, list);
    return list;
  }

  const builtin = PRESETS.find((p) => p.id === presetId);
  const override = await Cfg.getPresetModels(presetId);
  const list = override || (builtin?.models ? [...builtin.models] : []);
  presetModelsCache.set(presetId, list);
  return list;
}

// Return the effective URL for the active preset. For built-in presets
// we check for a user override saved in `url_<presetId>` before falling
// back to the preset's default URL; for custom providers we read the
// entry's `url` field directly. The result lives in `presetUrlCache` so
// calls during a render pass are cheap.
async function loadUrlFor(presetId) {
  if (!presetId) return "";
  if (presetUrlCache.has(presetId)) return presetUrlCache.get(presetId);

  const customMatch = customProviders.find((c) => c.id === presetId);
  if (customMatch) {
    const url = customMatch.url || "";
    presetUrlCache.set(presetId, url);
    return url;
  }

  const builtin = PRESETS.find((p) => p.id === presetId);
  const override = await Cfg.getPresetUrl(presetId);
  const url = override || builtin?.url || "";
  presetUrlCache.set(presetId, url);
  return url;
}

function modelsForSync(presetId) {
  return presetModelsCache.get(presetId) || [];
}

async function saveModelsFor(presetId, list) {
  presetModelsCache.set(presetId, list);
  const customIdx = customProviders.findIndex((c) => c.id === presetId);
  if (customIdx >= 0) {
    const next = customProviders.map((c, i) =>
      i === customIdx ? { ...c, models: list } : c
    );
    await Cfg.setCustomProviders(next);
    customProviders = next;
  } else {
    await Cfg.setPresetModels(presetId, list);
  }
}

// Persist the current f-model draft for the leaving provider, but only
// when the leaving provider is a custom one and the typed value isn't
// already in its list (otherwise it's just the "selected" model, no
// need to stash a draft). Built-in presets get their draft cleared on
// every switch — they don't keep state between visits.
function stashCurrentDraft() {
  if (!currentPresetId) return;
  const isCustom = !!customProviders.find((c) => c.id === currentPresetId);
  if (!isCustom) {
    customDraftModels.delete(currentPresetId);
    return;
  }
  const typed = $("f-model").value.trim();
  const list = modelsForSync(currentPresetId);
  if (typed && !list.includes(typed)) {
    customDraftModels.set(currentPresetId, typed);
  } else {
    customDraftModels.delete(currentPresetId);
  }
}

function populateModelDropdown(presetId, selectedModel) {
  const sel = $("f-model-quick");
  sel.innerHTML = "";
  sel.appendChild(new Option(t("opt.modelCustom"), "__custom__"));

  const models = modelsForSync(presetId);
  for (const m of models) sel.appendChild(new Option(m, m));

  sel.value = selectedModel && models.includes(selectedModel)
    ? selectedModel
    : "__custom__";
  updateModelButtons();
}

function syncModelDropdown() {
  const sel = $("f-model-quick");
  const val = $("f-model").value.trim();
  const opts = [...sel.options].map((o) => o.value);
  sel.value = opts.includes(val) ? val : "__custom__";
  updateModelButtons();
}

// Enable + only when the input is non-empty and not already in the list;
// enable − only when the selected dropdown row is a real model (not the
// "__custom__" placeholder).
function updateModelButtons() {
  const sel = $("f-model-quick");
  const input = $("f-model").value.trim();
  const models = modelsForSync(currentPresetId);
  const addBtn = $("f-model-add");
  const removeBtn = $("f-model-remove");
  if (addBtn) addBtn.disabled = !currentPresetId || !input || models.includes(input);
  if (removeBtn) removeBtn.disabled = !currentPresetId || sel.value === "__custom__";
}

function renderPresets() {
  const wrap = $("presets");
  wrap.innerHTML = "";
  for (const p of allPresets()) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pre";
    b.dataset.presetId = p.id;
    const label = document.createElement("span");
    label.textContent = p.name;
    b.appendChild(label);
    b.addEventListener("click", async () => {
      // Switching preset: first stash the leaving provider's "uncommitted
      // model draft" if it's a custom provider with a non-empty input
      // that isn't yet in its model list. Built-in presets don't get a
      // draft — their input is treated as transient and clears on switch.
      stashCurrentDraft();

      const effectiveUrl = await loadUrlFor(p.id);
      $("f-url").value = effectiveUrl;
      $("f-key").value = await Cfg.getProviderKey(p.id);

      currentPresetId = p.id;
      await loadModelsFor(p.id);

      // Decide what goes into f-model on the new preset:
      //   1. If this is a custom provider with a stashed draft, restore it.
      //   2. Otherwise empty the field — explicit user request: switching
      //      providers clears the input. The provider's `.model` hint is
      //      no longer auto-populated; the user picks from the dropdown.
      const isCustom = !!customProviders.find((c) => c.id === p.id);
      const draft = isCustom ? customDraftModels.get(p.id) : null;
      $("f-model").value = draft || "";

      populateModelDropdown(p.id, $("f-model").value.trim());
      updateCustomTools();
    });

    wrap.appendChild(b);
  }

  // Trailing "+" chip to add a custom provider.
  const add = document.createElement("button");
  add.type = "button";
  add.className = "pre pre-add";
  add.textContent = "+";
  add.title = t("opt.custom.add");
  add.addEventListener("click", () => openCustomModal(null));
  wrap.appendChild(add);

  // Normalize chip min-width to OpenAI's rendered width so short custom
  // names don't render tiny chips. Read after layout flush.
  requestAnimationFrame(() => {
    const ref = wrap.querySelector('.pre[data-preset-id="openai"]');
    if (ref && !ref.classList.contains("pre-add")) {
      // Clear first so we measure the natural width, not a previously
      // applied min-width.
      wrap.style.removeProperty("--chip-min-w");
      const w = ref.offsetWidth;
      if (w > 0) wrap.style.setProperty("--chip-min-w", w + "px");
    }
  });
}

function updateCustomTools() {
  const tools = $("custom-tools");
  if (!tools) return;
  const active = customProviders.find((c) => c.id === currentPresetId);
  if (!active) {
    tools.hidden = true;
    return;
  }
  tools.hidden = false;
  $("ct-compat").value = active.compat || "openai";
}

function bindCustomTools() {
  $("ct-compat").addEventListener("change", async (e) => {
    const active = customProviders.find((c) => c.id === currentPresetId);
    if (!active) return;
    const next = customProviders.map((c) =>
      c.id === active.id ? { ...c, compat: e.target.value } : c
    );
    try {
      await Cfg.setCustomProviders(next);
      customProviders = next;
    } catch {
      alert(t("opt.custom.errStorage"));
      // Revert UI to the saved value.
      $("ct-compat").value = active.compat || "openai";
    }
  });

  $("ct-delete").addEventListener("click", async () => {
    const active = customProviders.find((c) => c.id === currentPresetId);
    if (!active) return;
    if (!confirm(t("opt.custom.confirmDelete", active.name))) return;
    const next = customProviders.filter((c) => c.id !== active.id);
    try {
      await Cfg.setCustomProviders(next);
      customProviders = next;
      try { await chrome.storage.local.remove("apiKey_" + active.id); } catch {}
      presetModelsCache.delete(active.id);
      presetUrlCache.delete(active.id);
      customDraftModels.delete(active.id);
      // The deleted provider was the active one, so clear its URL / key /
      // model from the form too — otherwise the user is staring at the
      // settings of a provider that no longer exists.
      $("f-url").value = "";
      $("f-key").value = "";
      $("f-model").value = "";
      currentPresetId = null;
      populateModelDropdown(null, "");
      updateCustomTools();
      renderPresets();
    } catch {
      alert(t("opt.custom.errStorage"));
    }
  });
}

async function openCustomModal(provider) {
  editingId = provider?.id || null;
  $("custom-modal-title").textContent = editingId ? t("opt.custom.editTitle") : t("opt.custom.title");
  $("cp-save").textContent = editingId ? t("opt.custom.save") : t("opt.custom.add");
  $("cp-name").value = provider?.name || "";
  $("cp-url").value = provider?.url || "";
  $("cp-compat").value = provider?.compat || "openai";
  $("cp-model").value = provider?.model || "";
  $("cp-key").value = "";
  $("cp-error").hidden = true;
  $("cp-error").textContent = "";

  // Reveal-state reset for the modal eye each time it opens.
  const cpKey = $("cp-key");
  const cpEye = $("cp-key-eye");
  cpKey.type = "password";
  cpEye.setAttribute("aria-pressed", "false");
  cpEye.innerHTML = EYE_SHOW_SVG;
  refreshEyeTitle(cpEye);

  // When editing, prefill the masked field with the saved key so the user
  // can reveal it. When adding, leave blank.
  if (editingId) {
    try {
      const saved = await Cfg.getProviderKey(editingId);
      if (saved) cpKey.value = saved;
    } catch {}
  }

  $("custom-modal").hidden = false;
  setTimeout(() => $("cp-name").focus(), 0);
}

function closeCustomModal() {
  $("custom-modal").hidden = true;
  editingId = null;
}

// URL validation helper — validates format, protocol, and hostname.
function validateUrl(url) {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: "URL cannot be empty" };
  }
  if (url.length > 500) {
    return { valid: false, error: "URL too long (max 500 chars)" };
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "URL must use HTTP or HTTPS protocol" };
    }
    if (!parsed.hostname) {
      return { valid: false, error: "URL must have a valid hostname" };
    }
    return { valid: true };
  } catch (e) {
    if (e instanceof TypeError) {
      return { valid: false, error: "Invalid URL format" };
    }
    return { valid: false, error: String(e) };
  }
}

// Model name validation helper: ensures the model identifier follows
// a reasonable format. Accepts patterns like:
//   "gpt-5.5", "claude-sonnet-4.6", "gemini-3.5-flash",
//   "anthropic/claude-opus-4.7" (OpenRouter style),
//   "custom-model-name-123".
function validateModelName(name) {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Model name cannot be empty" };
  }
  const trimmed = name.trim();
  if (trimmed.length > 200) {
    return { valid: false, error: "Model name too long (max 200 chars)" };
  }
  if (/[<>"']/.test(trimmed)) {
    return { valid: false, error: "Model name contains invalid characters" };
  }
  // Must contain at least one alphanumeric character.
  if (!/[a-zA-Z0-9]/.test(trimmed)) {
    return { valid: false, error: "Model name must contain at least one alphanumeric character" };
  }
  return { valid: true };
}

async function saveCustomProvider() {
  const name = $("cp-name").value.trim();
  const url = $("cp-url").value.trim();
  const compat = $("cp-compat").value;
  const model = $("cp-model").value.trim();
  const key = $("cp-key").value;
  const errEl = $("cp-error");

  const showErr = (k) => {
    errEl.textContent = t(k);
    errEl.hidden = false;
  };

  const modelValidation = validateModelName(model);
  if (!modelValidation.valid) {
    errEl.textContent = modelValidation.error;
    errEl.hidden = false;
    return;
  }

  if (!name) return showErr("opt.custom.errName");
  if (name.length > 50) return showErr("opt.custom.errNameLong");
  if (!model) return showErr("opt.custom.errModel");
  if (model.length > 100) return showErr("opt.custom.errModel");
  if (!url || url.length > 500) return showErr("opt.custom.errUrlInvalid");

  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    errEl.textContent = urlValidation.error;
    errEl.hidden = false;
    return;
  }

  // Validate against the completed URL: the request layer auto-fills the
  // path when the user typed only a host or host+/v1, so a bare host with
  // gemini compat is fine even though the literal input has no placeholders.
  const effectiveUrl = completeUrlForCompat(url, compat);
  const hasKeyPlaceholder = /\{key\}/i.test(effectiveUrl);
  const hasModelPlaceholder = /\{model\}/i.test(effectiveUrl);
  if (compat === "gemini") {
    if (!hasKeyPlaceholder || !hasModelPlaceholder) {
      return showErr("opt.custom.errGeminiPlaceholders");
    }
  } else {
    // Only complain about placeholders the user typed themselves —
    // autocomplete never adds them under non-gemini compat.
    if (/\{key\}/i.test(url) || /\{model\}/i.test(url)) {
      return showErr("opt.custom.errPlaceholderUnsupported");
    }
  }

  const dup = allPresets().find((p) => p.url === url && p.id !== editingId);
  if (dup) return showErr("opt.custom.errDup");

  const id = editingId || ("custom-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6));
  // When editing, keep whatever the user had built up via the model
  // editor (the cache holds the latest list); otherwise seed with the
  // single typed default.
  const existingModels = editingId
    ? (customProviders.find((c) => c.id === editingId)?.models || presetModelsCache.get(editingId) || [model])
    : [model];
  const models = existingModels.includes(model) ? existingModels : [...existingModels, model];
  const entry = { id, name, url, compat, model, models, custom: true };

  // Build next state in a local first; only mutate the in-memory list once
  // chrome.storage.local accepts the write, so a rejected write doesn't
  // leave a phantom chip the user can't dismiss.
  const next = editingId
    ? customProviders.map((c) => (c.id === editingId ? entry : c))
    : [...customProviders, entry];

  try {
    await Cfg.setCustomProviders(next);
    if (key) await Cfg.setProviderKey(id, key);
    customProviders = next;
    presetModelsCache.set(id, [...models]);
  } catch {
    return showErr("opt.custom.errStorage");
  }

  renderPresets();
  updateCustomTools();
  closeCustomModal();
}

function bindCustomModal() {
  $("cp-cancel").addEventListener("click", closeCustomModal);
  $("cp-save").addEventListener("click", saveCustomProvider);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("custom-modal").hidden) closeCustomModal();
  });
}

function refreshEyeTitle(btn) {
  if (!btn) return;
  const shown = btn.getAttribute("aria-pressed") === "true";
  btn.title = t(shown ? "opt.eye.hide" : "opt.eye.show");
  btn.setAttribute("aria-label", btn.title);
}

function attachKeyEye(input, btn) {
  if (!input || !btn) return;
  btn.innerHTML = EYE_SHOW_SVG;
  refreshEyeTitle(btn);
  btn.addEventListener("click", () => {
    const next = input.type === "password" ? "text" : "password";
    input.type = next;
    const shown = next === "text";
    btn.setAttribute("aria-pressed", shown ? "true" : "false");
    btn.innerHTML = shown ? EYE_HIDE_SVG : EYE_SHOW_SVG;
    refreshEyeTitle(btn);
  });
}

function bindEyes() {
  attachKeyEye($("f-key"), $("f-key-eye"));
  attachKeyEye($("cp-key"), $("cp-key-eye"));
}

function bindSegmented() {
  const root = $("f-mode");
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg");
    if (!btn) return;
    setMode(btn.dataset.value);
  });
  root.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const segs = [...root.querySelectorAll(".seg")];
    const i = segs.findIndex((s) => s.classList.contains("active"));
    const next = e.key === "ArrowLeft"
      ? segs[(i - 1 + segs.length) % segs.length]
      : segs[(i + 1) % segs.length];
    setMode(next.dataset.value);
    next.focus();
    e.preventDefault();
  });
}

function bindLanguage() {
  $("f-lang").addEventListener("change", (e) => setLanguage(e.target.value));
}

function bindModelControls() {
  $("f-model-quick").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "__custom__") {
      $("f-model").focus();
    } else {
      $("f-model").value = v;
    }
    updateModelButtons();
  });
  $("f-model").addEventListener("input", syncModelDropdown);

  $("f-model-add").addEventListener("click", async () => {
    if (!currentPresetId) return;
    const name = $("f-model").value.trim();
    if (!name) return;
    const list = modelsForSync(currentPresetId);
    if (list.includes(name)) return;
    const next = [...list, name];
    try {
      await saveModelsFor(currentPresetId, next);
      // Once the typed name is in the list, it's no longer a "draft" —
      // it's a real entry. Clear the per-provider draft so coming back
      // doesn't restore it as if it were unsaved.
      customDraftModels.delete(currentPresetId);
      populateModelDropdown(currentPresetId, name);
    } catch {
      alert(t("opt.custom.errStorage"));
    }
  });

  $("f-model-remove").addEventListener("click", async () => {
    if (!currentPresetId) return;
    const sel = $("f-model-quick");
    const target = sel.value;
    if (!target || target === "__custom__") return;
    if (!confirm(t("opt.model.confirmRemove", target))) return;
    const list = modelsForSync(currentPresetId);
    const next = list.filter((m) => m !== target);
    try {
      await saveModelsFor(currentPresetId, next);
      // If the removed model was also the current "active" model in the
      // input box, leave the input alone but flip the dropdown to
      // "__custom__" so the UI matches reality.
      const stillSelected = $("f-model").value.trim();
      populateModelDropdown(currentPresetId, stillSelected);
    } catch {
      alert(t("opt.custom.errStorage"));
    }
  });
  $("f-url").addEventListener("input", async () => {
    const id = detectPresetFromUrl($("f-url").value.trim());
    // Only switch when the typed URL exactly matches a *different* preset.
    // Mid-edit values that don't match anything must NOT clear
    // currentPresetId, otherwise the inline custom-tools section flickers
    // away while the user is still typing.
    if (id && id !== currentPresetId) {
      currentPresetId = id;
      await loadModelsFor(id);
      populateModelDropdown(id, $("f-model").value.trim());
      updateCustomTools();
    }
  });
}

// M13: Test API connection by sending a lightweight HEAD request.
async function testConnection() {
  const url = $("f-url")?.value.trim();
  const key = $("f-key")?.value.trim();
  const statusEl = $("connection-status");
  if (!statusEl) return;
  statusEl.hidden = false;
  statusEl.className = "conn-status";
  statusEl.textContent = t("opt.conn.testing");

  if (!key || !url) {
    statusEl.textContent = t("opt.conn.skipped");
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      method: "HEAD",
      headers: { "Authorization": "Bearer " + key },
      signal: controller.signal,
    });
    clearTimeout(timer);
    statusEl.textContent = resp.ok
      ? t("opt.conn.success")
      : t("opt.conn.fail") + " (" + resp.status + ")";
    statusEl.className = "conn-status " + (resp.ok ? "conn-ok" : "conn-err");
  } catch (e) {
    statusEl.textContent = t("opt.conn.fail") + ": " + (e.name === "AbortError" ? "timeout" : e.message);
    statusEl.className = "conn-status conn-err";
  }
}

async function init() {
  customProviders = await Cfg.getCustomProviders();
  renderLanguageOptions();
  renderPresets();
  bindSegmented();
  bindLanguage();
  bindModelControls();
  bindCustomModal();
  bindCustomTools();
  bindEyes();
  await fillForm(await Cfg.get());
}

$("save").addEventListener("click", async () => {
  const url = $("f-url").value.trim();
  const key = $("f-key").value.trim();

  // Validate main form URL
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    const flashEl = $("status");
    flashEl.textContent = "⚠️ " + urlValidation.error;
    setTimeout(() => { flashEl.textContent = ""; }, 3000);
    return;
  }

  // Validate model name
  const modelValidation = validateModelName($("f-model").value.trim());
  if (!modelValidation.valid) {
    const flashEl = $("status");
    flashEl.textContent = "⚠️ " + modelValidation.error;
    setTimeout(() => { flashEl.textContent = ""; }, 3000);
    return;
  }

  const matched = allPresets().find((p) => p.url === url);
  if (matched && key) await Cfg.setProviderKey(matched.id, key);

  // Persist URL changes back to provider config. For custom providers,
  // update the entry's `url` field; for built-in presets, write an
  // override to chrome.storage.local (`url_<presetId>`).
  if (currentPresetId) {
    const customIdx = customProviders.findIndex((c) => c.id === currentPresetId);
    if (customIdx >= 0) {
      // Custom provider: update the entry's URL field.
      const next = customProviders.map((c, i) =>
        i === customIdx ? { ...c, url } : c
      );
      await Cfg.setCustomProviders(next);
      customProviders = next;
      presetUrlCache.set(currentPresetId, url);
    } else {
      // Built-in preset: write URL override to storage.
      const builtin = PRESETS.find((p) => p.id === currentPresetId);
      if (builtin) {
        if (url !== builtin.url) {
          await Cfg.setPresetUrl(currentPresetId, url);
          presetUrlCache.set(currentPresetId, url);
        } else {
          // User restored the default URL — clear the override.
          await Cfg.clearPresetUrl(currentPresetId);
          presetUrlCache.set(currentPresetId, url);
        }
      }
    }
  }

  await Cfg.set({
    language: currentLang,
    apiUrl: url,
    apiKey: key,
    model: $("f-model").value.trim(),
    maxTokens: +$("f-tokens").value || DEFAULTS.maxTokens,
    maxContentLength: +$("f-maxlen").value || DEFAULTS.maxContentLength,
    temperature: parseFloat($("f-temp").value) || DEFAULTS.temperature,
    stream: $("f-stream").checked,
    summarizeMode: currentMode,
    systemPrompt: $("f-sys").value,
    userPrompt: $("f-prompt").value,
  });
  flash(t("opt.saved"));
});

// M12: Export all settings as a downloadable JSON file (API keys excluded).
async function exportSettings() {
  try {
    const all = await chrome.storage.local.get(null);
    const safe = {};
    for (const [k, v] of Object.entries(all)) {
      if (!k.startsWith("apiKey_") && k !== "apiKey" && k !== "error_logs") {
        safe[k] = v;
      }
    }
    safe._exportVersion = chrome.runtime?.getManifest?.()?.version || "unknown";
    safe._exportedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "summary-agent-settings.json";
    a.click();
    URL.revokeObjectURL(url);
    flash(t("opt.exported"));
  } catch (e) {
    flash("\u26a0\ufe0f Export failed: " + e.message);
  }
}

// M12: Import settings from a user-selected JSON file.
async function importSettings() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || (!data.apiUrl && !data.language)) {
        throw new Error("Not a valid Summary Agent settings file");
      }
      if (!confirm(t("opt.importConfirm"))) return;
      delete data._exportVersion;
      delete data._exportedAt;
      await chrome.storage.local.set(data);
      flash(t("opt.imported"));
      setTimeout(() => location.reload(), 500);
    } catch (e) {
      flash("\u26a0\ufe0f Import failed: " + e.message);
    }
  });
  input.click();
}

// M12: Wire export/import buttons.
document.getElementById("export-settings")?.addEventListener("click", exportSettings);
document.getElementById("import-settings")?.addEventListener("click", importSettings);

$("reset").addEventListener("click", async () => {
  if (!confirm(t("opt.resetConfirm"))) return;
  await Cfg.reset();
  // Reset reverts to DEFAULTS but keeps provider API keys; pull the key
  // matching the default API URL so the form reflects what's actually
  // stored.
  const matched = allPresets().find((p) => p.url === DEFAULTS.apiUrl);
  const apiKey = matched ? await Cfg.getProviderKey(matched.id) : "";
  await fillForm({ ...DEFAULTS, apiKey });
  flash(t("opt.resetDone"));
});

function flash(text) {
  const el = $("status");
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 1800);
}

init();
