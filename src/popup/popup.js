import { makeT } from "../lib/i18n.js";

async function applyI18n() {
  const got = await chrome.storage.local.get("language");
  const lang = got.language || "en";
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  const t = makeT(lang);
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  document.title = t("popup.title");
}
applyI18n();

document.getElementById("run").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "open-and-summarize" });
  } catch (e) {
    // Content script not yet injected (e.g. extension just installed on an existing tab).
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["src/content.css"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "open-and-summarize" });
    } catch {}
  }
  window.close();
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
