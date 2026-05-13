/*
 * i18n strings for the GUI. Keep keys stable; English values match the
 * existing source-of-truth strings, Chinese values mirror the upstream
 * Tampermonkey ZH_CN userscript.
 *
 * The model's system & user prompts are NOT translated. Instead, the
 * panel/options-page UI uses these strings, and when calling the API we
 * append "Output the summarize text in {language}." to the user prompt
 * so the model adapts on its own.
 */
export const SUPPORTED_LANGS = ["en", "zh", "ja"];
export const LANG_LABELS = { en: "English", zh: "简体中文", ja: "日本語" };

// Used inside the "Output the summarize text in {language}." line we
// append to the user prompt. Always English keywords so the model is
// guaranteed to recognize them.
export const OUTPUT_LANG_NAME = { en: "English", zh: "Chinese", ja: "Japanese" };

export const STRINGS = {
  en: {
    /* Floating panel */
    "panel.title": "🤖 AI Content Summary & Chat",
    "panel.copy": "📋 Copy",
    "panel.settings": "⚙️ Settings",
    "panel.close": "✕",
    "panel.placeholder": 'Click the "Start Summary" button below.<br>AI will automatically extract and analyze current page content 📖',
    "panel.fabTitle": "AI Content Summary",
    "panel.stop": "⏹ Stop",
    "panel.start": "✨ Start Summary",
    "panel.resummarize": "🔄 Re-summarize",
    "panel.followupPlaceholder": "Enter follow-up question, press Enter to send...",
    "panel.rerunTooltip": "Re-summarize",
    "panel.sendTooltip": "Send",
    "panel.extracting": "Extracting page content...",
    "panel.analyzing": "AI is analyzing...",
    "panel.thinking": "Thinking...",
    "panel.extractFail": "❌ Page content extraction failed or content is too short.",
    "panel.metaExtracted": (n) => `· Extracted ${n} chars`,
    "panel.emptyReply": "(AI returned empty content)",
    "panel.manuallyStopped": "Manually stopped",
    "panel.copyNothing": "No content to copy",
    "panel.copied": "✓ Copied to clipboard",
    "panel.copyFail": "Copy failed, please select manually",
    "panel.apiKeyMissing": "API key not configured; open settings.",
    "panel.optionFollowup": (opt) => `The user picked this follow-up: "${opt}". Respond to it directly and helpfully, then end your reply with 2–4 new [[option]] chips that suggest useful next steps — short phrases, no numbering, each wrapped in double square brackets on its own.`,

    /* Options page */
    "opt.title": "⚙️ AI Summary Settings",
    "opt.language": "Language",
    "opt.mode": "Summarize mode",
    "opt.mode.off": "Off",
    "opt.mode.onOpen": "On open",
    "opt.mode.implicit": "Implicit",
    "opt.mode.hint.off": "Opening the panel waits for you to click Start Summary.",
    "opt.mode.hint.onOpen": "Clicking the floating button opens the panel and immediately starts summarizing.",
    "opt.mode.hint.implicit": "Summarization runs in the background as soon as the page finishes loading. Opening the panel shows progress or the finished result.",
    "opt.apiUrl": "API URL",
    "opt.apiKey": "API Key",
    "opt.model": "Model",
    "opt.maxTokens": "Max output tokens",
    "opt.maxLen": "Max content length",
    "opt.temperature": "Temperature",
    "opt.stream": "Stream output",
    "opt.sysPrompt": "System prompt",
    "opt.userPrompt": "User prompt",
    "opt.userPromptVars": "(variables: {title} {content})",
    "opt.reset": "↩ Restore defaults",
    "opt.save": "💾 Save",
    "opt.saved": "✓ Saved",
    "opt.resetConfirm": "Restore all default settings?",
    "opt.resetDone": "✓ Defaults restored",

    /* Popup */
    "popup.title": "🤖 AI Summary",
    "popup.run": "✨ Summarize current page",
    "popup.settings": "⚙️ Settings",
  },

  zh: {
    /* Floating panel */
    "panel.title": "🤖 AI 内容总结与对话",
    "panel.copy": "📋 复制",
    "panel.settings": "⚙️ 设置",
    "panel.close": "✕",
    "panel.placeholder": "点击下方「开始总结」按钮<br>AI 将自动提取并分析当前页面内容 📖",
    "panel.fabTitle": "AI 内容总结",
    "panel.stop": "⏹ 停止",
    "panel.start": "✨ 开始总结",
    "panel.resummarize": "🔄 重新总结",
    "panel.followupPlaceholder": "输入追问内容，回车发送…",
    "panel.rerunTooltip": "重新总结",
    "panel.sendTooltip": "发送",
    "panel.extracting": "正在提取页面内容…",
    "panel.analyzing": "AI 正在分析…",
    "panel.thinking": "思考中…",
    "panel.extractFail": "❌ 页面内容提取失败或内容过少。",
    "panel.metaExtracted": (n) => `· 已提取 ${n} 字`,
    "panel.emptyReply": "（AI 返回内容为空）",
    "panel.manuallyStopped": "已手动停止",
    "panel.copyNothing": "暂无内容可复制",
    "panel.copied": "✓ 已复制到剪贴板",
    "panel.copyFail": "复制失败，请手动选择",
    "panel.apiKeyMissing": "未设置 API Key，请打开设置进行配置。",
    "panel.optionFollowup": (opt) => `用户选择了这个后续方向：“${opt}”。请直接针对这个选项给出具体回答，然后在回复末尾另起一行，提供 2–4 个 [[选项]] 作为下一步可选方向——每条为简短短语，用双方括号包裹，各占一行，不要编号。`,

    /* Options page */
    "opt.title": "⚙️ AI 总结 设置",
    "opt.language": "语言",
    "opt.mode": "总结模式",
    "opt.mode.off": "关闭",
    "opt.mode.onOpen": "直接总结",
    "opt.mode.implicit": "隐式总结",
    "opt.mode.hint.off": "打开面板后需手动点击「开始总结」。",
    "opt.mode.hint.onOpen": "点击悬浮按钮打开面板后立即开始总结。",
    "opt.mode.hint.implicit": "页面加载完成后后台开始总结。打开面板将显示进度或已完成结果。",
    "opt.apiUrl": "API 地址",
    "opt.apiKey": "API Key",
    "opt.model": "模型名称",
    "opt.maxTokens": "最大输出 Token",
    "opt.maxLen": "最大内容长度",
    "opt.temperature": "温度",
    "opt.stream": "流式输出",
    "opt.sysPrompt": "系统提示词",
    "opt.userPrompt": "用户提示词",
    "opt.userPromptVars": "（变量：{title} {content}）",
    "opt.reset": "↩ 恢复默认",
    "opt.save": "💾 保存",
    "opt.saved": "✓ 已保存",
    "opt.resetConfirm": "确认恢复所有默认设置？",
    "opt.resetDone": "✓ 已恢复默认设置",

    /* Popup */
    "popup.title": "🤖 AI 总结",
    "popup.run": "✨ 总结当前页面",
    "popup.settings": "⚙️ 设置",
  },

  ja: {
    /* Floating panel */
    "panel.title": "🤖 AI 内容要約とチャット",
    "panel.copy": "📋 コピー",
    "panel.settings": "⚙️ 設定",
    "panel.close": "✕",
    "panel.placeholder": "下の「要約を開始」ボタンをクリックしてください。<br>AIが現在のページ内容を自動的に抽出して分析します 📖",
    "panel.fabTitle": "AI 内容要約",
    "panel.stop": "⏹ 停止",
    "panel.start": "✨ 要約を開始",
    "panel.resummarize": "🔄 再要約",
    "panel.followupPlaceholder": "追問内容を入力し、Enterで送信...",
    "panel.rerunTooltip": "再要約",
    "panel.sendTooltip": "送信",
    "panel.extracting": "ページ内容を抽出中...",
    "panel.analyzing": "AIが分析中...",
    "panel.thinking": "思考中...",
    "panel.extractFail": "❌ ページ内容の抽出に失敗したか、内容が短すぎます。",
    "panel.metaExtracted": (n) => `· ${n} 文字を抽出しました`,
    "panel.emptyReply": "(AIが空の内容を返しました)",
    "panel.manuallyStopped": "手動で停止しました",
    "panel.copyNothing": "コピーする内容がありません",
    "panel.copied": "✓ クリップボードにコピーしました",
    "panel.copyFail": "コピーに失敗しました。手動で選択してください",
    "panel.apiKeyMissing": "APIキーが設定されていません。設定を開いてください。",
    "panel.optionFollowup": (opt) => `ユーザーは次のフォローアップを選択しました：「${opt}」。この内容に対して直接、簡潔に回答してください。その後、回答の最後に新しい行から始めて、次のステップの候補となる 2〜4 個の [[選択肢]] を提示してください。各選択肢は短いフレーズとし、二重の角括弧で囲み、1行に1つずつ記載してください。番号は振らないでください。`,

    /* Options page */
    "opt.title": "⚙️ AI 要約 設定",
    "opt.language": "言語",
    "opt.mode": "要約モード",
    "opt.mode.off": "オフ",
    "opt.mode.onOpen": "パネルを開く時に開始",
    "opt.mode.implicit": "バックグラウンド実行",
    "opt.mode.hint.off": "パネルを開いた後、「要約を開始」をクリックするまで待機します。",
    "opt.mode.hint.onOpen": "フローティングボタンをクリックしてパネルを開くと、すぐに要約を開始します。",
    "opt.mode.hint.implicit": "ページ読み込み完了後、バックグラウンドで要約を開始します。パネルを開くと進捗または完了結果が表示されます。",
    "opt.apiUrl": "API URL",
    "opt.apiKey": "API キー",
    "opt.model": "モデル",
    "opt.maxTokens": "最大出力トークン",
    "opt.maxLen": "最大コンテンツ長",
    "opt.temperature": "温度",
    "opt.stream": "ストリーム出力",
    "opt.sysPrompt": "システムプロンプト",
    "opt.userPrompt": "ユーザープロンプト",
    "opt.userPromptVars": "(変数: {title} {content})",
    "opt.reset": "↩ デフォルトに戻す",
    "opt.save": "💾 保存",
    "opt.saved": "✓ 保存しました",
    "opt.resetConfirm": "すべての設定をデフォルトに戻しますか？",
    "opt.resetDone": "✓ デフォルトに戻しました",

    /* Popup */
    "popup.title": "🤖 AI 要約",
    "popup.run": "✨ このページを要約",
    "popup.settings": "⚙️ 設定",
  },
};

export function makeT(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  const fallback = STRINGS.en;
  return function t(key, ...args) {
    const v = table[key] ?? fallback[key];
    if (typeof v === "function") return v(...args);
    return v ?? key;
  };
}
