# Summary Agent

A Microsoft Edge / Chromium extension (Manifest V3) for one-click webpage summarization and follow-up chat. Port of the original [AI-summary](../AI-summary) Tampermonkey userscript, rebuilt around a service-worker streaming relay, draggable in-page panel, and persistent local settings.

API keys and settings are stored in `chrome.storage.local` and never leave the browser.

## Features

### Summarization
- One-click main-content extraction from any normal webpage.
- Streaming AI responses relayed through the MV3 service worker.
- Markdown-light rendering (bold, italic, inline code, headings, bullet lists).
- Follow-up chat after the first summary: ask further questions in the same panel.
- Clickable `[[option]]` chips: when the model ends its reply with bracketed follow-up suggestions, they render as underlined links. Clicking one sends a structured follow-up prompt that asks the model to keep generating new option chips.

### Floating button & panel
- Edge-snapped floating button with hover-peek, draggable repositioning, and persisted location.
- Draggable summary/chat panel that anchors to the button's peek position and stays inside the viewport even as streaming content grows.
- Toolbar popup action and page context-menu action ("AI summarize this page") for explicit triggers.
- Keyboard shortcut: `Alt+S` toggles the toolbar popup.

### Configuration
- Three summary modes (settings page):
  - **Off** — no automatic summary; click *Start Summary* in the panel.
  - **On open** — start summarizing the moment the floating panel opens.
  - **Implicit** — summarize in the background once the tab finishes loading. Opening the panel later attaches to the in-progress job or shows the completed result.
- UI languages: English, 简体中文, 日本語, 한국어. Language switches live across already-open tabs via `chrome.storage.onChanged`.
- Output-language steering: rather than translating the system/user prompts, the extension appends `Output the summarize text in <Language>.` to the user message, so the model adapts its response.
- Provider presets: OpenAI (defaults to Responses API `/v1/responses`), Anthropic, Gemini, xAI, DeepSeek, OpenRouter — each with a per-provider model dropdown stocked with current mainstream models.
- Custom providers: a trailing `+` chip lets you add your own endpoints. Each entry stores name, URL, default model, optional API key (with a reveal "eye" toggle), and a compatibility format chosen from OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, or Gemini `generateContent`. Existing entries can be edited or deleted from the chip.
- Free-form custom API URL/key/model plus max tokens, temperature, stream mode, content length, system prompt, and user prompt.

### Implicit-mode readiness signal
Implicit mode waits for **both** signals before firing, instead of a fixed post-load timeout:
- the tab load status reported by `chrome.tabs.onUpdated` / `sender.tab.status`, and
- the content script's local `document.readyState`.

## Install (development)

1. Open `edge://extensions` (or `chrome://extensions`).
2. Toggle **Developer mode** on.
3. Click **Load unpacked** and select this `Summary-Agent` directory.
4. Pin the extension, open its options page, configure a provider and API key.
5. Use the floating button, the toolbar popup, or the page context-menu action.

## Project layout

```text
manifest.json            MV3 manifest
src/
  background.js          Service worker: fetch + SSE streaming relay,
                         context menu, tab load tracking, storage migrations
  content.js             Injected UI, extraction, panel state machine,
                         summary/chat workflow, inlined panel i18n
  content.css            Injected UI styles and page-CSS isolation
  lib/
    defaults.js          Default config and provider presets
    extract.js           Main-content extraction
    i18n.js              Shared en/zh/ja/ko string tables (options + popup)
    providers.js         Provider request/response adapters
    storage.js           chrome.storage.local wrapper
  popup/                 Toolbar popup
options/                 Full settings page
icons/                   Icon assets / placeholder
```

## Notes

- `host_permissions: ["<all_urls>"]` lets the content script run on regular webpages and the service worker reach configured API endpoints.
- Restricted browser surfaces (`edge://`, `chrome://`, the Web Store, etc.) cannot be injected by extensions; the floating button won't appear there.
- Anthropic direct calls from the browser require the `anthropic-dangerous-direct-browser-access: true` header (sent automatically). Anthropic treats MV3 service workers as a browser context.
- GPT-5 series models auto-route to OpenAI's Responses API (`/v1/responses`), but **only when the API URL points at `api.openai.com`**. Aggregators (OpenRouter, etc.) keep using their own chat-completions endpoint even with a `gpt-5*` model name.
- API compatibility depends on the selected provider's request/response shape. Custom endpoints should match one of: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Gemini `generateContent`/`streamGenerateContent`.

## License

Same as the upstream userscript.
