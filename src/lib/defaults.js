export const DEFAULTS = {
  apiUrl: "https://openrouter.ai/api/v1/chat/completions",
  apiKey: "",
  model: "google/gemini-3.1-pro-preview",
  maxTokens: 2048,
  temperature: 0.7,
  stream: true,
  maxContentLength: 16000,
  // UI language. Supported: "en", "zh".
  language: "en",
  // "off"        : do nothing on open
  // "on-open"    : start summarizing when the user opens the panel
  // "implicit"   : summarize in the background as soon as the page loads;
  //                opening the panel just reveals whatever's ready
  summarizeMode: "off",
  systemPrompt:
    "You are a professional web content analysis assistant, skilled at extracting and summarizing the core content of articles, providing concise and clear answers.",
  userPrompt: `Please provide a summary and analysis of the following webpage content:

Title: {title}

Content:
{content}

Please respond in the following format:
📌 **Theme**: One sentence summarizing the article theme

🔑 **Key Points**:
- Point one
- Point two
- Point three

💡 **Summary**: Brief conclusion`,
};

export const PRESETS = [
  { id: "openai",     name: "OpenAI",     url: "https://api.openai.com/v1/chat/completions",                                                          model: "gpt-5.5" },
  { id: "anthropic",  name: "Anthropic",  url: "https://api.anthropic.com/v1/messages",                                                               model: "claude-opus-4.7" },
  { id: "gemini",     name: "Gemini",     url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",           model: "gemini-3.1-pro-preview" },
  { id: "xai",        name: "xAI",        url: "https://api.x.ai/v1/chat/completions",                                                                model: "gork-4.3" },
  { id: "deepseek",   name: "DeepSeek",   url: "https://api.deepseek.com/v1/chat/completions",                                                        model: "deepseek-v4-pro" },
  { id: "openrouter", name: "Openrouter", url: "https://openrouter.ai/api/v1/chat/completions",                                                       model: "google/gemini-3.1-pro-preview" },
];
