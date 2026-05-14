export const DEFAULTS = {
  apiUrl: "https://openrouter.ai/api/v1/chat/completions",
  apiKey: "",
  model: "google/gemini-3.1-pro-preview",
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
  },
  {
    id: "anthropic",
    name: "Anthropic",
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-opus-4.7",
  },
  {
    id: "gemini",
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
    model: "gemini-3.1-pro-preview",
  },
  {
    id: "xai",
    name: "xAI",
    url: "https://api.x.ai/v1/chat/completions",
    model: "gork-4.3",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-v4-pro",
  },
  {
    id: "openrouter",
    name: "Openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "google/gemini-3.1-pro-preview",
  },
];
