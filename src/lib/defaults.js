export const DEFAULTS = {
  apiUrl: "https://openrouter.ai/api/v1/chat/completions",
  apiKey: "",
  model: "anthropic/claude-opus-4.7",
  maxTokens: 2048,
  temperature: 0.7,
  stream: true,
  maxContentLength: 16000,
  // UI language. Supported: "en", "zh", "ja", "ko".
  language: "en",
  // "off"        : do nothing on open
  // "on-open"    : start summarizing when the user opens the panel
  // "implicit"   : summarize in the background as soon as the page loads;
  //                opening the panel just reveals whatever's ready
  summarizeMode: "off",
  // Auto-retry on transient network errors (429, 503, timeouts).
  // Up to 3 attempts with exponential backoff.
  autoRetry: true,
  // Keep last 10 summaries per tab in session storage.
  // Cleared on tab close or browser restart.
  enableHistory: true,
  // Cache extracted page content per-tab to avoid re-extracting on re-summarize.
  // Invalidated on URL change.
  enableExtractCache: true,
  systemPrompt: `You are an intelligent web content summarization assistant.

Your goal is to generate concise, high-signal summaries that help users quickly understand webpages.

Focus on:
- extracting the most important information
- removing noise and marketing-heavy language
- highlighting why the content matters
- surfacing notable signals, risks, or insights
- suggesting useful follow-up explorations

The response should feel:
- concise
- insight-focused
- fast to scan
- modern and browser-native
- slightly proactive, but not overly assistant-like

Adapt the structure naturally based on the webpage content.

Do not force rigid formats, bullet lists, or sections.
Use the most readable and information-dense structure for the specific page.

Use concise paragraphs, grouped insights, mini sections, or bullet points only when appropriate.`,

  userPrompt: `---

Generate a concise, high-signal understanding of the following webpage.

Webpage Title:
{title}

Webpage Content:
{content}

---

At the end of the response, generate 2 to 4 short follow-up exploration options.

Wrap each option using this format:

[[option text]]

Examples:
[[Compare with alternatives]]
[[Explain technical concepts]]
[[View community opinions]]
[[Summarize comments]]

Keep them short, actionable, and clickable-like.`,
};

export const PRESETS = [
  {
    id: "openai",
    name: "OpenAI",
    url: "https://api.openai.com/v1/responses",
    model: "gpt-5.5",
    models: [
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.5-pro",
      "gpt-5.4-pro",
      "gpt-5.3",
      "gpt-5.2",
      "gpt-4o",
      "o4-mini",
      "o3",
      "o3-pro",
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-opus-4.7",
    models: [
      "claude-opus-4.7",
      "claude-sonnet-4.6",
      "claude-opus-4.6",
      "claude-haiku-4.5",
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
    model: "gemini-3.5-flash",
    models: [
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ],
  },
  {
    id: "xai",
    name: "xAI",
    url: "https://api.x.ai/v1/chat/completions",
    model: "grok-4.3",
    models: [
      "grok-4.3",
      "grok-4.20-0309-reasoning",
      "grok-4.20-0309-non-reasoning",
      "grok-4-1-fast-reasoning",
      "grok-4-1-fast-non-reasoning",
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-v4-pro",
    models: [
      "deepseek-v4-pro",
      "deepseek-v4-flash",
    ],
  },
  {
    id: "openrouter",
    name: "Openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "anthropic/claude-opus-4.7",
    models: [
      "anthropic/claude-opus-4.7",
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-opus-4.6",
      "anthropic/claude-haiku-4.5",
      "openai/gpt-5.5",
      "openai/gpt-5.4",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.4-nano",
      "openai/gpt-5.5-pro",
      "openai/gpt-5.4-pro",
      "openai/gpt-5.3",
      "openai/gpt-5.2",
      "openai/gpt-4o",
      "openai/o4-mini",
      "openai/o3",
      "openai/o3-pro",
      "google/gemini-3.5-flash",
      "google/gemini-3.1-pro-preview",
      "google/gemini-3.1-flash-lite-preview",
      "google/gemini-3-flash-preview",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
    ],
  },
];
