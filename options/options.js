import { DEFAULTS, PRESETS } from "../src/lib/defaults.js";
import { Cfg } from "../src/lib/storage.js";
import { SUPPORTED_LANGS, LANG_LABELS, makeT } from "../src/lib/i18n.js";

const $ = (id) => document.getElementById(id);

let currentLang = "en";
let currentMode = "off";
let currentPresetId = null;
let t = makeT(currentLang);

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
}

function detectPresetFromUrl(url) {
  return PRESETS.find((p) => p.url === url)?.id || null;
}

function populateModelDropdown(presetId, selectedModel) {
  const sel = $("f-model-quick");
  sel.innerHTML = "";
  sel.appendChild(new Option(t("opt.modelCustom"), "__custom__"));

  const preset = PRESETS.find((p) => p.id === presetId);
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
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pre";
    b.textContent = p.name;
    b.addEventListener("click", async () => {
      $("f-url").value = p.url;
      $("f-model").value = p.model;
      $("f-key").value = await Cfg.getProviderKey(p.id);
      currentPresetId = p.id;
      populateModelDropdown(p.id, p.model);
    });
    wrap.appendChild(b);
  }
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
    }
  });
}

async function init() {
  renderLanguageOptions();
  renderPresets();
  bindSegmented();
  bindLanguage();
  bindModelControls();
  fillForm(await Cfg.get());
}

$("save").addEventListener("click", async () => {
  const url = $("f-url").value.trim();
  const key = $("f-key").value.trim();
  const matched = PRESETS.find((p) => p.url === url);
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
  const matched = PRESETS.find((p) => p.url === DEFAULTS.apiUrl);
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
