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

function fillForm(cfg) {
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
  setLanguage(cfg.language || "en");
  updateCustomTools();
}

function detectPresetFromUrl(url) {
  return allPresets().find((p) => p.url === url)?.id || null;
}

function populateModelDropdown(presetId, selectedModel) {
  const sel = $("f-model-quick");
  sel.innerHTML = "";
  sel.appendChild(new Option(t("opt.modelCustom"), "__custom__"));

  const preset = allPresets().find((p) => p.id === presetId);
  if (preset?.models) {
    for (const m of preset.models) sel.appendChild(new Option(m, m));
  }

  sel.value = selectedModel && preset?.models?.includes(selectedModel)
    ? selectedModel
    : "__custom__";
}

function syncModelDropdown() {
  const sel = $("f-model-quick");
  const val = $("f-model").value.trim();
  const opts = [...sel.options].map((o) => o.value);
  sel.value = opts.includes(val) ? val : "__custom__";
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
      $("f-url").value = p.url;
      $("f-model").value = p.model;
      $("f-key").value = await Cfg.getProviderKey(p.id);
      currentPresetId = p.id;
      populateModelDropdown(p.id, p.model);
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
      currentPresetId = null;
      populateModelDropdown(null, $("f-model").value.trim());
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

  if (!name) return showErr("opt.custom.errName");
  if (name.length > 50) return showErr("opt.custom.errNameLong");
  if (!model) return showErr("opt.custom.errModel");
  if (model.length > 100) return showErr("opt.custom.errModel");
  if (!url || url.length > 500) return showErr("opt.custom.errUrlInvalid");

  let parsed;
  try { parsed = new URL(url); } catch { return showErr("opt.custom.errUrlInvalid"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return showErr("opt.custom.errUrlInvalid");
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
  const entry = { id, name, url, compat, model, models: [model], custom: true };

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
  });
  $("f-model").addEventListener("input", syncModelDropdown);
  $("f-url").addEventListener("input", () => {
    const id = detectPresetFromUrl($("f-url").value.trim());
    if (id !== currentPresetId) {
      currentPresetId = id;
      populateModelDropdown(id, $("f-model").value.trim());
      updateCustomTools();
    }
  });
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
  fillForm(await Cfg.get());
}

$("save").addEventListener("click", async () => {
  const url = $("f-url").value.trim();
  const key = $("f-key").value.trim();
  const matched = allPresets().find((p) => p.url === url);
  if (matched && key) await Cfg.setProviderKey(matched.id, key);

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

$("reset").addEventListener("click", async () => {
  if (!confirm(t("opt.resetConfirm"))) return;
  await Cfg.reset();
  // Reset reverts to DEFAULTS but keeps provider API keys; pull the key
  // matching the default API URL so the form reflects what's actually
  // stored.
  const matched = allPresets().find((p) => p.url === DEFAULTS.apiUrl);
  const apiKey = matched ? await Cfg.getProviderKey(matched.id) : "";
  fillForm({ ...DEFAULTS, apiKey });
  flash(t("opt.resetDone"));
});

function flash(text) {
  const el = $("status");
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 1800);
}

init();
