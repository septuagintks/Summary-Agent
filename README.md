# Edge Agent - AI Summary

Microsoft Edge / Chromium extension for one-click webpage summarization and follow-up chat. It is a Manifest V3 extension port of the original Tampermonkey userscript workflow, with local settings, a floating page button, a draggable result panel, streaming responses, and configurable API providers.

API keys and settings are stored locally in chrome.storage.local.

## Features

- Floating AI summary button injected into normal webpages.
- Edge-snapped button with hover peek, drag repositioning, and viewport-aware placement.
- Draggable summary/chat panel with copy, settings, close, regenerate, and send controls.
- Main-content extraction from the current page.
- Streaming AI responses through the MV3 service worker.
- Follow-up chat after the first summary.
- Toolbar popup action and page context-menu action.
- UI languages supported: English, Chinese, Japanese, Korean, German.
- Provider presets for OpenAI, Anthropic, Gemini, xAI, DeepSeek, and OpenRouter-compatible APIs.
- Custom API URL, model, max tokens, temperature, stream mode, content length, system prompt, and user prompt.

## Summary Modes

The settings page exposes three summary modes:

- Off: no automatic summary.
- On open: starts summarizing when the floating panel is opened.
- Implicit: starts summarizing in the background after the page has finished loading. Opening the panel later attaches to the running job or displays the completed result.

Implicit mode now waits for both signals before starting:

- the tab load status from chrome.tabs.onUpdated / sender.tab.status
- the content script document.readyState

This avoids relying on a fixed post-load timeout while still ensuring the content script and page are ready.

## Development Load

1. Open edge://extensions or chrome://extensions.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this Edge-Agent directory.
5. Pin the extension, open settings, configure a provider/API key, then use the floating button or toolbar popup.

## Project Layout

`	ext
manifest.json       MV3 manifest
src/
  background.js     Service worker: streaming API relay, context menu, tab load status
  content.js        Injected UI, extraction, panel state, summary/chat workflow
  content.css       Injected UI styles and page-CSS isolation
  lib/
    defaults.js     Default config and provider presets
    extract.js      Page content extraction logic
    i18n.js         Localization strings and helpers
    providers.js    Provider request/response adapters
    storage.js      chrome.storage.local wrapper
  popup/            Toolbar popup
options/            Full settings page
icons/              Icon notes/assets
`

## Notes

- The extension uses host_permissions: ["<all_urls>"] so the content script can run on supported webpages and the service worker can call configured API endpoints.
- Restricted browser pages such as edge:// / chrome:// cannot be injected by normal extensions.
- API compatibility depends on the selected provider and endpoint format.

## License

Same as the upstream userscript.
