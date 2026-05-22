/*
 * Content script for Summary Agent extension.
 * Port of the AI-summary Tampermonkey userscript (see ../AI-summary).
 *
 * Differences from the userscript:
 *   - GM_xmlhttpRequest (streaming) → chrome.runtime.connect("ai-call") to the service worker
 *   - GM_setValue/getValue       → chrome.storage.local
 *   - GM_addStyle                → content.css (loaded via manifest)
 *   - Settings panel             → opens the extension's options page in a new tab
 *                                  (the in-userscript settings panel is intentionally not ported)
 */
(() => {
  if (window.__aiSummaryInjected) return;
  window.__aiSummaryInjected = true;

  /* ================================================
       Constants
    ================================================ */
  // Fab resting & peek geometry. All positions are derived from the
  // scrollable content width (innerWidth - scrollbarW), so peek distance
  // and visible sliver are symmetric on both sides regardless of whether
  // the page has a scrollbar.
  const FAB_PEEK_VISIBLE = 18;  // px of fab visible when snapped to the edge
  const FAB_PEEK_GAP = 15;      // px from edge to fab's inner side when hovered-out

  /* ================================================
       i18n (inlined — content scripts are not modules)
       Keep in sync with src/lib/i18n.js.
    ================================================ */
  const I18N = {
    en: {
      "panel.title":                "🤖 AI Content Summary & Chat",
      "panel.copy":                 "📋 Copy",
      "panel.settings":             "⚙️ Settings",
      "panel.close":                "✕",
      "panel.placeholder":          'Click the "Start Summary" button below.<br>AI will automatically extract and analyze current page content 📖',
      "panel.fabTitle":             "AI Content Summary",
      "panel.stop":                 "⏹ Stop",
      "panel.start":                "✨ Start Summary",
      "panel.resummarize":          "🔄 Re-summarize",
      "panel.followupPlaceholder":  "Enter follow-up question, press Enter to send...",
      "panel.rerunTooltip":         "Re-summarize",
      "panel.sendTooltip":          "Send",
      "panel.extracting":           "Extracting page content...",
      "panel.analyzing":            "AI is analyzing...",
      "panel.thinking":             "Thinking...",
      "panel.extractFail":          "❌ Page content extraction failed or content is too short.",
      "panel.metaExtracted":        (n) => `· Extracted ${n} chars`,
      "panel.emptyReply":           "(AI returned empty content)",
      "panel.manuallyStopped":      "Manually stopped",
      "panel.copyNothing":          "No content to copy",
      "panel.copied":               "✓ Copied to clipboard",
      "panel.copyFail":             "Copy failed, please select manually",
      "panel.apiKeyMissing":        "API key not configured; open settings.",
      "panel.optionFollowup":       (opt) => `The user picked this follow-up: "${opt}". Respond to it directly and helpfully, then end your reply with 2–4 new [[option]] chips that suggest useful next steps — short phrases, no numbering, each wrapped in double square brackets on its own.`,
    },
    zh: {
      "panel.title":                "🤖 AI 内容总结与对话",
      "panel.copy":                 "📋 复制",
      "panel.settings":             "⚙️ 设置",
      "panel.close":                "✕",
      "panel.placeholder":          "点击下方「开始总结」按钮<br>AI 将自动提取并分析当前页面内容 📖",
      "panel.fabTitle":             "AI 内容总结",
      "panel.stop":                 "⏹ 停止",
      "panel.start":                "✨ 开始总结",
      "panel.resummarize":          "🔄 重新总结",
      "panel.followupPlaceholder":  "输入追问内容，回车发送…",
      "panel.rerunTooltip":         "重新总结",
      "panel.sendTooltip":          "发送",
      "panel.extracting":           "正在提取页面内容…",
      "panel.analyzing":            "AI 正在分析…",
      "panel.thinking":             "思考中…",
      "panel.extractFail":          "❌ 页面内容提取失败或内容过少。",
      "panel.metaExtracted":        (n) => `· 已提取 ${n} 字`,
      "panel.emptyReply":           "（AI 返回内容为空）",
      "panel.manuallyStopped":      "已手动停止",
      "panel.copyNothing":          "暂无内容可复制",
      "panel.copied":               "✓ 已复制到剪贴板",
      "panel.copyFail":             "复制失败，请手动选择",
      "panel.apiKeyMissing":        "未设置 API Key，请打开设置进行配置。",
      "panel.optionFollowup":       (opt) => `用户选择了这个后续方向：“${opt}”。请直接针对这个选项给出具体回答，然后在回复末尾另起一行，提供 2–4 个 [[选项]] 作为下一步可选方向——每条为简短短语，用双方括号包裹，各占一行，不要编号。`,
    },
    ja: {
      "panel.title":                "🤖 AI コンテンツ要約 & チャット",
      "panel.copy":                 "📋 コピー",
      "panel.settings":             "⚙️ 設定",
      "panel.close":                "✕",
      "panel.placeholder":          "下の「要約を開始」ボタンをクリックしてください。<br>AIが現在のページ内容を自動的に抽出して分析します 📖",
      "panel.fabTitle":             "AI コンテンツ要約",
      "panel.stop":                 "⏹ 停止",
      "panel.start":                "✨ 要約を開始",
      "panel.resummarize":          "🔄 再要約",
      "panel.followupPlaceholder":  "追加の質問を入力し、Enter キーで送信...",
      "panel.rerunTooltip":         "再要約",
      "panel.sendTooltip":          "送信",
      "panel.extracting":           "ページ内容を抽出中...",
      "panel.analyzing":            "AI が分析中...",
      "panel.thinking":             "思考中...",
      "panel.extractFail":          "❌ ページ内容の抽出に失敗したか、内容が短すぎます。",
      "panel.metaExtracted":        (n) => `· ${n} 文字を抽出しました`,
      "panel.emptyReply":           "(AI が空の内容を返しました)",
      "panel.manuallyStopped":      "手動で停止しました",
      "panel.copyNothing":          "コピーする内容がありません",
      "panel.copied":               "✓ クリップボードにコピーしました",
      "panel.copyFail":             "コピーに失敗しました。手動で選択してください",
      "panel.apiKeyMissing":        "API キーが設定されていません。設定を開いてください。",
      "panel.optionFollowup":       (opt) => `ユーザーは次のフォローアップを選択しました：「${opt}」。この内容に対して直接、簡潔に回答してください。その後、回答の最後に新しい行から始めて、次のステップの候補となる 2〜4 個の [[選択肢]] を提示してください。各選択肢は短いフレーズとし、二重の角括弧で囲み、1 行に 1 つずつ記載してください。番号は振らないでください。`,
    },
    ko: {
      "panel.title":                "🤖 AI 콘텐츠 요약 & 채팅",
      "panel.copy":                 "📋 복사",
      "panel.settings":             "⚙️ 설정",
      "panel.close":                "✕",
      "panel.placeholder":          "아래의 '요약 시작' 버튼을 클릭하세요.<br>AI가 현재 페이지 콘텐츠를 자동으로 추출하고 분석합니다 📖",
      "panel.fabTitle":             "AI 콘텐츠 요약",
      "panel.stop":                 "⏹ 중지",
      "panel.start":                "✨ 요약 시작",
      "panel.resummarize":          "🔄 다시 요약",
      "panel.followupPlaceholder":  "추가 질문을 입력하고 Enter 키를 누르세요...",
      "panel.rerunTooltip":         "다시 요약",
      "panel.sendTooltip":          "전송",
      "panel.extracting":           "페이지 콘텐츠 추출 중...",
      "panel.analyzing":            "AI가 분석 중...",
      "panel.thinking":             "생각 중...",
      "panel.extractFail":          "❌ 페이지 콘텐츠 추출에 실패했거나 콘텐츠가 너무 짧습니다.",
      "panel.metaExtracted":        (n) => `· ${n}자 추출됨`,
      "panel.emptyReply":           "(AI가 빈 내용을 반환했습니다)",
      "panel.manuallyStopped":      "수동으로 중지했습니다",
      "panel.copyNothing":          "복사할 내용이 없습니다",
      "panel.copied":               "✓ 클립보드에 복사했습니다",
      "panel.copyFail":             "복사에 실패했습니다. 수동으로 선택해 주세요",
      "panel.apiKeyMissing":        "API 키가 설정되지 않았습니다. 설정을 열어주세요.",
      "panel.optionFollowup":       (opt) => `사용자가 다음 후속 질문을 선택했습니다: "${opt}". 이 질문에 대해 직접적이고 도움이 되는 방식으로 답변한 다음, 답변 끝에 다음 단계로 유용한 2~4개의 [[선택지]]를 제안하십시오. 각 선택지는 짧은 구문으로 작성하고, 이중 대괄호로 감싸며, 각 줄에 하나씩 배치하십시오. 번호는 매기지 마십시오.`,
    },
  };
  // English output keyword injected into the user prompt.
  const OUTPUT_LANG_NAME = { en: "English", zh: "Chinese", ja: "Japanese", ko: "Korean" };

  let currentLang = "en";
  function t(key, ...args) {
    const table = I18N[currentLang] || I18N.en;
    const v = table[key] ?? I18N.en[key];
    return typeof v === "function" ? v(...args) : (v ?? key);
  }
  const scrollbarW = () => window.innerWidth - document.documentElement.clientWidth;
  const VIEWPORT_MARGIN = 10;
  const PANEL_WIDTH = 420;
  const PANEL_FAB_GAP = 15;
  const FAB_DRAG_MARGIN = 10;
  const FAB_DEFAULT_OFFSET = 22;
  const PANEL_ANIM_TRANSITION = "transform .32s cubic-bezier(.21, .61, .35, 1), opacity .32s cubic-bezier(.21, .61, .35, 1), box-shadow .24s ease";

  /* ================================================
       Content extraction
    ================================================ */
  const STRIP_SEL = [
    "script", "style", "noscript", "iframe", "svg", "canvas",
    "nav", "header", "footer", "aside",
    '[role="navigation"]',
    '[class*="navbar"]', '[class*="nav-"]', '[id*="nav-"]',
    '[class*="sidebar"]', '[class*="side-bar"]',
    '[class*="comment"]', '[class*="footer"]', '[class*="header"]',
    '[class*="banner"]',
    '[class*="advertisement"]', '[class*="-ads"]', '[class*="ads-"]', '[id*="ads"]',
    '[class*="popup"]', '[class*="modal"]', '[class*="cookie"]',
    ".share", ".social", ".related", ".recommend",
  ];
  const CONTENT_SEL = [
    "article", '[role="main"]', "main",
    ".article-content", ".article-body", ".post-content", ".entry-content",
    ".content-body", ".news-content", ".detail-content", ".story-content",
    "#article", "#content", "#main-content",
  ];
  const cleanText = (t) => String(t || "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  function extractContent() {
    try {
      const clone = document.documentElement.cloneNode(true);
      for (const sel of STRIP_SEL) {
        try { clone.querySelectorAll(sel).forEach((e) => e.remove()); } catch {}
      }
      for (const sel of CONTENT_SEL) {
        const el = clone.querySelector(sel);
        if (el) {
          const t = (el.textContent || "").trim();
          if (t.length > 300) return cleanText(t);
        }
      }
      const body = clone.querySelector("body");
      return cleanText(body?.textContent || document.body.textContent || "");
    } catch {
      return cleanText(document.body.textContent || "");
    }
  }

  /* ================================================
       Markdown rendering
    ================================================ */
  // The source text typically contains `[[option text]]` markers the
  // model emits at the end of a response. We turn them into clickable
  // follow-up chips.  `data-ais-opt` carries the raw option text so the
  // click handler can forward it to the model.
  const OPT_RE = /\[\[([^\[\]\n]{1,120})\]\]/g;
  function renderOptionMarkers(escaped) {
    return escaped.replace(OPT_RE, (_m, inner) => {
      // `inner` is already HTML-escaped (we ran the whole string through
      // esc0 first). Put it in both data-attr and text content verbatim.
      const attr = inner.replace(/"/g, "&quot;");
      return `<span class="ais-opt" role="button" tabindex="0" data-ais-opt="${attr}">${inner}</span>`;
    });
  }

  function renderMd(raw) {
    const esc0 = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = esc0(raw).split("\n");
    let html = "";
    let inUl = false;

    for (const rawLine of lines) {
      let line = rawLine
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, '<code class="ais-code">$1</code>');
      line = renderOptionMarkers(line);

      if (/^#{1,3} /.test(rawLine)) {
        if (inUl) { html += "</ul>"; inUl = false; }
        html += `<h3 class="ais-h">${line.replace(/^#+\s*/, "")}</h3>`;
        continue;
      }
      if (/^[-*•] /.test(rawLine)) {
        if (!inUl) { html += '<ul class="ais-ul">'; inUl = true; }
        html += `<li>${line.replace(/^[-*•]\s*/, "")}</li>`;
        continue;
      }
      if (inUl) { html += "</ul>"; inUl = false; }
      if (!rawLine.trim()) { html += "<br>"; continue; }
      html += `<p>${line}</p>`;
    }
    if (inUl) html += "</ul>";
    return html;
  }

  /* ================================================
       Utilities
    ================================================ */
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const toggle = (id, show) => $(id)?.classList.toggle("ais-off", !show);
  const setBody = (html) => { const b = $("ais-body"); if (b) b.innerHTML = html; };

  function showToast(msg, color = "#111827") {
    const t = document.createElement("div");
    t.className = "ais-toast";
    t.style.background = color;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 400);
    }, 2200);
  }

  function setLoading(v) {
    const run = $("ais-run"), stop = $("ais-stop"), chat = $("ais-chat-wrap");
    if (stop) stop.style.display = v ? "" : "none";
    if (v) {
      if (run) run.style.display = "none";
      if (chat) chat.style.display = "none";
    }
  }

  function showChatMode() {
    $("ais-run").style.display = "none";
    $("ais-chat-wrap").style.display = "flex";
    $("ais-chat-input").focus();
  }

  function animateMainPanelUpdate(update) {
    const panel = $("ais-main");
    if (!panel || panel.classList.contains("ais-off")) {
      update?.();
      return;
    }

    const before = panel.getBoundingClientRect();
    update?.();
    const after = panel.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const sx = after.width ? before.width / after.width : 1;
    const sy = after.height ? before.height / after.height : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
      return;
    }

    panel.style.transition = "none";
    panel.style.transformOrigin = "top left";
    panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    void panel.offsetWidth;
    panel.style.transition = PANEL_ANIM_TRANSITION;
    panel.style.transform = "";
    panel.addEventListener("transitionend", () => {
      panel.style.transition = "";
      panel.style.transformOrigin = "";
    }, { once: true });
  }

  /* ================================================
       AI call (port to service worker)
    ================================================ */
  let currentPort = null;

  function callAPI(messages, { onChunk, onDone, onError }) {
    if (currentPort) {
      // Shouldn't happen — callers gate on `streaming` — but if it does
      // (e.g. an implicit run still holding the port), surface it as an
      // error instead of silently dropping the call. Async so callers can
      // finish their synchronous setup first.
      setTimeout(() => onError?.("Another AI call is already in progress"), 0);
      return;
    }
    let finished = false;
    const finish = (fn, ...args) => {
      if (finished) return;
      finished = true;
      currentPort = null;
      fn?.(...args);
    };

    const port = chrome.runtime.connect({ name: "ai-call" });
    currentPort = port;

    port.onMessage.addListener((msg) => {
      if (msg.type === "chunk") onChunk(msg.text);
      else if (msg.type === "done") finish(onDone, msg.text);
      else if (msg.type === "error") finish(onError, msg.error);
    });
    port.onDisconnect.addListener(() => {
      if (!finished) finish(onError, "Connection closed");
    });
    port.postMessage({ type: "start", messages });
  }

  function abortAPI() {
    if (currentPort) {
      try { currentPort.disconnect(); } catch {}
      currentPort = null;
    }
  }

  /* ================================================
       State
    ================================================ */
  let panelOpen = false;
  let streaming = false;
  let fullText = "";
  let chatHistory = [];
  let currentResNode = null;
  window.snapSide = "right";

  /* ================================================
       Build UI
    ================================================ */
  function createMainPanel() {
    const panel = document.createElement("div");
    panel.id = "ais-main";
    panel.className = "ais-off";
    panel.innerHTML = `
      <div class="ais-hd">
        <span class="ais-hd-title" data-i18n="panel.title"></span>
        <button class="ais-hbtn" id="ais-copy"     data-i18n="panel.copy"></button>
        <button class="ais-hbtn" id="ais-cfg-open" data-i18n="panel.settings"></button>
        <button class="ais-hbtn" id="ais-main-close" data-i18n="panel.close"></button>
      </div>
      <div class="ais-meta" id="ais-meta">${esc(document.title)}</div>
      <div class="ais-body" id="ais-body">
        <div class="ais-ph" data-i18n-html="panel.placeholder"></div>
      </div>
      <div class="ais-ft" id="ais-ft-actions">
        <button class="ais-btn ais-danger"  id="ais-stop" style="display:none" data-i18n="panel.stop"></button>
        <button class="ais-btn ais-primary" id="ais-run"                       data-i18n="panel.start"></button>
        <div class="ais-chat-wrap" id="ais-chat-wrap" style="display:none;">
          <button class="ais-btn ais-secondary ais-btn-square" id="ais-re-run"   data-i18n-title="panel.rerunTooltip">🔄</button>
          <input type="text" class="ais-chat-input" id="ais-chat-input" data-i18n-placeholder="panel.followupPlaceholder">
          <button class="ais-btn ais-primary ais-btn-square" id="ais-chat-send" data-i18n-title="panel.sendTooltip">⬆️</button>
        </div>
      </div>
    `;
    applyI18nIn(panel);
    return panel;
  }

  // Apply translations to all data-i18n* attributes inside `root`.
  // Idempotent — safe to call again when the language changes.
  function applyI18nIn(root) {
    for (const el of root.querySelectorAll("[data-i18n]"))            el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll("[data-i18n-html]"))       el.innerHTML   = t(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const el of root.querySelectorAll("[data-i18n-title]"))      el.title       = t(el.dataset.i18nTitle);
  }

  /* ================================================
       Make panel draggable by its header
    ================================================ */
  function makeDraggable(panelId) {
    const panel = $(panelId);
    const hd = panel.querySelector(".ais-hd");
    if (!hd) return;
    const DRAG_THRESHOLD = 8;
    let isMouseDown = false, isDragging = false;
    const start = { x: 0, y: 0 };
    const offset = { x: 0, y: 0 };

    hd.addEventListener("mousedown", (e) => {
      if (e.target.tagName.toLowerCase() === "button") return;
      isMouseDown = true;
      isDragging = false;
      const rect = panel.getBoundingClientRect();
      start.x = e.clientX;
      start.y = e.clientY;
      offset.x = e.clientX - rect.left;
      offset.y = e.clientY - rect.top;
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.transition = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isMouseDown) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!isDragging && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      if (!isDragging) isDragging = true;

      let left = e.clientX - offset.x;
      let top = e.clientY - offset.y;
      left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, left));
      top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, top));
      panel.style.left = left + "px";
      panel.style.top = top + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      if (!isDragging) return;
      isDragging = false;
      panel.style.transition = "";
    });
  }

  /* ================================================
       Position main panel relative to the fab.
       Anchored to the fab's *peek* position (not runtime rect), so the
       panel's distance from the viewport edge is identical whether the
       fab is currently snapped, peeking, or mid-animation. Without this,
       opening the panel during peek then letting the fab snap back would
       cause the panel to jump inward on the next re-position.
    ================================================ */
  function positionMainPanelBasedOnFab() {
    const fab = $("ais-fab");
    const mainPanel = $("ais-main");
    if (!fab || !mainPanel) return;
    const fabRect = fab.getBoundingClientRect();
    const isLeft = fabRect.left + fabRect.width / 2 < window.innerWidth / 2;
    const vR = window.innerWidth - scrollbarW();

    mainPanel.style.right = "auto";
    mainPanel.style.bottom = "auto";

    // Virtual fab x-extent at peek position — used as the anchor.
    const peekLeftEdge = isLeft ? FAB_PEEK_GAP : vR - fab.offsetWidth - FAB_PEEK_GAP;
    const peekRightEdge = peekLeftEdge + fab.offsetWidth;

    let leftPos = isLeft ? peekRightEdge + PANEL_FAB_GAP : peekLeftEdge - PANEL_WIDTH - PANEL_FAB_GAP;
    leftPos = Math.max(VIEWPORT_MARGIN, Math.min(vR - PANEL_WIDTH - VIEWPORT_MARGIN, leftPos));
    mainPanel.style.left = leftPos + "px";

    const panelHeight = mainPanel.offsetHeight || PANEL_WIDTH;
    let topPos = Math.max(VIEWPORT_MARGIN, Math.min(window.innerHeight - panelHeight - VIEWPORT_MARGIN, fabRect.top));
    mainPanel.style.top = topPos + "px";
  }

  /* ================================================
       Keep the panel inside the viewport as its height
       changes (streaming content grows the body).
    ================================================ */
  function installPanelViewportClamp(panel) {
    let pending = false;
    const clamp = () => {
      pending = false;
      if (panel.classList.contains("ais-off")) return;
      const rect = panel.getBoundingClientRect();
      const maxTop = window.innerHeight - rect.height - VIEWPORT_MARGIN;
      const minTop = VIEWPORT_MARGIN;
      // Read current top from inline style if present, else use rect.top.
      const curTop = parseFloat(panel.style.top);
      const baseTop = Number.isFinite(curTop) ? curTop : rect.top;
      let targetTop = baseTop;
      if (baseTop > maxTop) targetTop = Math.max(minTop, maxTop);
      if (targetTop < minTop) targetTop = minTop;
      if (Math.abs(targetTop - baseTop) > 0.5) {
        panel.style.top = targetTop + "px";
      }
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(clamp);
    };

    try {
      new ResizeObserver(schedule).observe(panel);
    } catch {}
    window.addEventListener("resize", schedule);
    return schedule;
  }

  /* ================================================
       FAB controller (state machine).
       States: idle | pressing | dragging | hovering | snapping

       Key design points (after several iterations):
       - Drag is 1:1 with the pointer: NO CSS transition on left/top while
         dragging. Every previous version that animated drag (even 80ms)
         introduced lag at 60fps.
       - Hover is NOT detected via pointerenter/leave on the fab. When the
         fab is snapped, only 8–12px of it is on-screen; peeking moves the
         fab body to x=15, which (especially on the left side) can leave
         the user's pointer outside the fab → instant leave → flicker.
         Instead we track the pointer on document and hit-test against a
         hover ZONE anchored at the snapped position. The zone doesn't
         move when the fab peeks, so the loop cannot occur.
       - Hover transitions are debounced; a quick brush past the edge
         doesn't pop the fab in and out.
       - When we land back in `idle`, we re-check the hover zone once so a
         pointer parked over the fab during a snap still triggers peek.
    ================================================ */
  const FAB_EASE_SNAP = "cubic-bezier(0.16, 0.84, 0.32, 1.08)"; // slow→fast→tiny overshoot
  const FAB_EASE_PEEK = "cubic-bezier(0.22, 1, 0.36, 1)";       // gentle ease-out
  const FAB_DUR_SNAP = 420;
  const FAB_DUR_PEEK_IN = 340;     // slower than before per user feedback
  const FAB_DUR_PEEK_OUT = 440;
  const HOVER_ENTER_W = 56;        // hit zone for triggering peek (small strip at edge)
  const HOVER_DISMISS_PAD = 28;    // padding around the peeked fab for dismissal
  const HOVER_ZONE_PAD_Y = 24;     // extra vertical padding (used for both zones)
  const HOVER_DEBOUNCE_IN = 120;
  const HOVER_DEBOUNCE_OUT = 180;

  function bindFabEvents(fab) {
    const DRAG_THRESHOLD = 8;
    let state = "idle"; // idle | pressing | dragging | hovering | snapping
    let pointerId = null;
    let downX = 0, downY = 0;
    let offX = 0, offY = 0;
    let snapEndTimer = null;

    // Hover-zone tracker
    let lastPointer = { x: -1, y: -1 };
    let hoverInTimer = null;
    let hoverOutTimer = null;
    let pointerMoveScheduled = false;
    let pressStartedFromHover = false;
    let pressPreservesAnimation = false;

    // Symmetric geometry: viewport-edge X positions.
    // Right side uses `viewportRight()` (excludes scrollbar) so peek
    // travel is identical to the left side.
    const viewportRight = () => window.innerWidth - scrollbarW();
    const snapLeftX = () => -(fab.offsetWidth - FAB_PEEK_VISIBLE);
    const snapRightX = () => viewportRight() - FAB_PEEK_VISIBLE;
    const peekLeftX = () => FAB_PEEK_GAP;
    const peekRightX = () => viewportRight() - fab.offsetWidth - FAB_PEEK_GAP;
    const currentSide = () => {
      const r = fab.getBoundingClientRect();
      return r.left + r.width / 2 < window.innerWidth / 2 ? "left" : "right";
    };
    const layoutLeft = () => {
      const left = parseFloat(getComputedStyle(fab).left);
      return Number.isFinite(left) ? left : fab.offsetLeft;
    };
    const layoutTop = () => {
      const top = parseFloat(getComputedStyle(fab).top);
      return Number.isFinite(top) ? top : fab.offsetTop;
    };

    function setTransition(value) {
      // Always keep the transform/box-shadow transitions alive (used by
      // :hover scale and the press/click feedback). Only left/top are
      // owned per-animation by JS.
      const base = "transform .26s cubic-bezier(0.22, 1, 0.36, 1), box-shadow .26s ease";
      fab.style.transition = value === "none" ? base : `${value}, ${base}`;
    }

    function animateTo(x, y, dur, ease, onDone) {
      setTransition(`left ${dur}ms ${ease}, top ${dur}ms ${ease}`);
      fab.style.left = x + "px";
      if (y != null) fab.style.top = y + "px";
      fab.style.right = "auto";
      fab.style.bottom = "auto";
      if (snapEndTimer) { clearTimeout(snapEndTimer); snapEndTimer = null; }
      snapEndTimer = setTimeout(() => {
        snapEndTimer = null;
        setTransition("none");
        onDone?.();
      }, dur + 30);
    }

    function clearHoverTimers() {
      if (hoverInTimer) { clearTimeout(hoverInTimer); hoverInTimer = null; }
      if (hoverOutTimer) { clearTimeout(hoverOutTimer); hoverOutTimer = null; }
    }

    function cancelPositionAnimation() {
      if (snapEndTimer) { clearTimeout(snapEndTimer); snapEndTimer = null; }
      setTransition("none");
    }

    /* ---- Hover zones:
         - enter zone  : a narrow strip along the snap edge; triggers peek
         - dismiss zone: the peeked fab's bounding box plus padding on all
           four sides; only leaving THIS zone ends the peek.
         Both zones are anchored to the viewport edge, not the runtime fab
         rect, so animation progress never affects hit-testing. ---- */
    function enterZone() {
      const side = currentSide();
      const fabTop = parseFloat(fab.style.top) || fab.getBoundingClientRect().top;
      const fabH = fab.offsetHeight || 35;
      const vR = viewportRight();
      return {
        xMin: side === "left" ? 0 : vR - HOVER_ENTER_W,
        xMax: side === "left" ? HOVER_ENTER_W : vR,
        yMin: fabTop - HOVER_ZONE_PAD_Y,
        yMax: fabTop + fabH + HOVER_ZONE_PAD_Y,
      };
    }
    function dismissZone() {
      const side = currentSide();
      const fabTop = parseFloat(fab.style.top) || fab.getBoundingClientRect().top;
      const fabH = fab.offsetHeight || 35;
      const fabW = fab.offsetWidth || 35;
      const vR = viewportRight();
      // Peeked fab's inner edge (toward screen center).
      const peekFar = side === "left"
        ? FAB_PEEK_GAP + fabW
        : vR - FAB_PEEK_GAP - fabW;
      return {
        xMin: side === "left" ? 0 : peekFar - HOVER_DISMISS_PAD,
        xMax: side === "left" ? peekFar + HOVER_DISMISS_PAD : vR,
        yMin: fabTop - HOVER_ZONE_PAD_Y - HOVER_DISMISS_PAD,
        yMax: fabTop + fabH + HOVER_ZONE_PAD_Y + HOVER_DISMISS_PAD,
      };
    }
    const inBox = (x, y, z) => x >= z.xMin && x <= z.xMax && y >= z.yMin && y <= z.yMax;
    function pointerCanTriggerPeek(x, y) { return inBox(x, y, enterZone()); }
    function pointerInDismissZone(x, y) { return inBox(x, y, dismissZone()); }

    function evaluateHover() {
      if (state !== "idle" && state !== "hovering") return;
      const x = lastPointer.x, y = lastPointer.y;
      if (state === "idle") {
        const inside = pointerCanTriggerPeek(x, y);
        if (inside) {
          if (hoverInTimer) return;
          if (hoverOutTimer) { clearTimeout(hoverOutTimer); hoverOutTimer = null; }
          hoverInTimer = setTimeout(() => {
            hoverInTimer = null;
            if (state !== "idle") return;
            if (!pointerCanTriggerPeek(lastPointer.x, lastPointer.y)) return;
            startPeek();
          }, HOVER_DEBOUNCE_IN);
        } else if (hoverInTimer) {
          clearTimeout(hoverInTimer);
          hoverInTimer = null;
        }
      } else {
        // state === "hovering" — use the larger dismiss zone.
        const inside = pointerInDismissZone(x, y);
        if (!inside) {
          if (hoverOutTimer) return;
          hoverOutTimer = setTimeout(() => {
            hoverOutTimer = null;
            if (state !== "hovering") return;
            if (pointerInDismissZone(lastPointer.x, lastPointer.y)) return;
            endPeek();
          }, HOVER_DEBOUNCE_OUT);
        } else if (hoverOutTimer) {
          // Re-entered while a pending out-debounce was running.
          clearTimeout(hoverOutTimer);
          hoverOutTimer = null;
        }
      }
    }

    document.addEventListener("pointermove", (e) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
      if (pointerMoveScheduled) return;
      pointerMoveScheduled = true;
      requestAnimationFrame(() => {
        pointerMoveScheduled = false;
        evaluateHover();
      });
    }, { passive: true });

    function transitionToIdle() {
      state = "idle";
      // Run hit test once so a pointer parked on the fab gets peeked.
      evaluateHover();
    }

    function startSnap() {
      state = "snapping";
      clearHoverTimers();
      window.snapSide = currentSide();
      const targetX = window.snapSide === "left" ? snapLeftX() : snapRightX();
      animateTo(targetX, null, FAB_DUR_SNAP, FAB_EASE_SNAP, transitionToIdle);
    }

    function startPeek() {
      state = "hovering";
      const targetX = currentSide() === "left" ? peekLeftX() : peekRightX();
      animateTo(targetX, null, FAB_DUR_PEEK_IN, FAB_EASE_PEEK);
    }

    function endPeek() {
      state = "snapping";
      const targetX = currentSide() === "left" ? snapLeftX() : snapRightX();
      animateTo(targetX, null, FAB_DUR_PEEK_OUT, FAB_EASE_PEEK, transitionToIdle);
    }

    /* ---- Pointer interaction on the fab itself ---- */
    fab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      clearHoverTimers();

      pressStartedFromHover = state === "hovering";
      pressPreservesAnimation = pressStartedFromHover && snapEndTimer != null;
      state = "pressing";
      pointerId = e.pointerId;
      try { fab.setPointerCapture(pointerId); } catch {}

      const rect = fab.getBoundingClientRect();
      const baseLeft = layoutLeft();
      const baseTop = layoutTop();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      downX = e.clientX;
      downY = e.clientY;
      if (!pressPreservesAnimation) {
        // Freeze the layout position immediately. The visual rect includes
        // hover/press scale, and writing it back makes clicks drift over time.
        cancelPositionAnimation();
        fab.style.left = baseLeft + "px";
        fab.style.top = baseTop + "px";
        fab.style.right = "auto";
        fab.style.bottom = "auto";
      }
      fab.classList.add("ais-fab-pressing");
    });

    fab.addEventListener("pointermove", (e) => {
      if (state !== "pressing" && state !== "dragging") return;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (state === "pressing") {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        state = "dragging";
        if (pressPreservesAnimation) {
          const baseLeft = layoutLeft();
          const baseTop = layoutTop();
          cancelPositionAnimation();
          fab.style.left = baseLeft + "px";
          fab.style.top = baseTop + "px";
          fab.style.right = "auto";
          fab.style.bottom = "auto";
          pressPreservesAnimation = false;
        }
        fab.classList.remove("ais-fab-pressing");
      }
      // 1:1 with the pointer. No transition during drag.
      const left = Math.max(
        FAB_DRAG_MARGIN,
        Math.min(window.innerWidth - fab.offsetWidth - FAB_DRAG_MARGIN, e.clientX - offX),
      );
      const top = Math.max(
        FAB_DRAG_MARGIN,
        Math.min(window.innerHeight - fab.offsetHeight - FAB_DRAG_MARGIN, e.clientY - offY),
      );
      fab.style.left = left + "px";
      fab.style.top = top + "px";
    });

    function releasePointer() {
      if (pointerId != null) {
        try { fab.releasePointerCapture(pointerId); } catch {}
        pointerId = null;
      }
    }

    fab.addEventListener("pointerup", (e) => {
      if (state !== "pressing" && state !== "dragging") {
        releasePointer();
        return;
      }
      const wasDragging = state === "dragging";
      releasePointer();
      fab.classList.remove("ais-fab-pressing");

      if (!wasDragging) {
        // Click: toggle the panel.
        state = pressStartedFromHover ? "hovering" : "idle";
        if (!pressPreservesAnimation) setTransition("none");
        fab.classList.remove("ais-fab-clicking");
        void fab.offsetWidth;
        fab.classList.add("ais-fab-clicking");
        fab.addEventListener("animationend",
          () => fab.classList.remove("ais-fab-clicking"),
          { once: true });
        panelOpen = !panelOpen;
        if (panelOpen) {
          positionMainPanelBasedOnFab();
          maybeAutoSummarize();
        }
        toggle("ais-main", panelOpen);
        pressStartedFromHover = false;
        pressPreservesAnimation = false;
        evaluateHover();
        return;
      }

      // Dragging → persist + snap.
      chrome.storage.local.set({
        fab_position: {
          xRatio: layoutLeft() / window.innerWidth,
          yRatio: layoutTop() / window.innerHeight,
        },
      });
      pressStartedFromHover = false;
      pressPreservesAnimation = false;
      startSnap();
    });

    fab.addEventListener("pointercancel", () => {
      releasePointer();
      if (state === "dragging") startSnap();
      else { state = "idle"; setTransition("none"); }
      pressStartedFromHover = false;
      pressPreservesAnimation = false;
      fab.classList.remove("ais-fab-pressing");
    });
  }

  /* ================================================
       Main panel events
    ================================================ */
  function bindMainEvents() {
    $("ais-main-close").addEventListener("click", () => {
      panelOpen = false;
      implicitState.attached = false; // implicit run continues in background but stops writing to DOM
      toggle("ais-main", false);
    });
    $("ais-cfg-open").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-options" }).catch(() => {});
    });
    $("ais-copy").addEventListener("click", () => {
      if (!fullText) { showToast(t("panel.copyNothing")); return; }
      navigator.clipboard.writeText(fullText)
        .then(() => showToast(t("panel.copied"), "#16a34a"))
        .catch(() => showToast(t("panel.copyFail")));
    });
    $("ais-stop").addEventListener("click", () => {
      abortAPI();
      streaming = false;
      setLoading(false);
      // If we were attached to an implicit run, mark it stopped so future
      // panel opens don't re-attach to a dangling state.
      if (implicitState.status === "running") {
        implicitState.status = "done";
        implicitState.text = fullText;
      }
      implicitState.attached = false;
      if (currentResNode) {
        currentResNode.innerHTML = renderMd(fullText || t("panel.manuallyStopped"));
        currentResNode.classList.remove("ais-cursor");
        currentResNode.removeAttribute("id");
      }
      if (chatHistory.length > 0) {
        if (fullText) chatHistory.push({ role: "assistant", content: fullText });
        $("ais-run").style.display = "none";
        $("ais-chat-wrap").style.display = "flex";
      } else {
        $("ais-run").style.display = "";
        $("ais-run").textContent = t("panel.resummarize");
      }
    });
    $("ais-run").addEventListener("click", doSummary);
    $("ais-re-run").addEventListener("click", () => doSummary());
    $("ais-chat-send").addEventListener("click", () => doFollowUp());
    $("ais-chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doFollowUp(); }
    });

    // Delegated click on option chips ([[...]] markers) anywhere in the
    // rendered response. The chip's text is what the model wrote, so we
    // forward it verbatim inside a language-appropriate template.
    const body = $("ais-body");
    const handleOpt = (e) => {
      const chip = e.target.closest?.(".ais-opt");
      if (!chip || streaming) return;
      const opt = chip.dataset.aisOpt || chip.textContent || "";
      if (!opt) return;
      e.preventDefault();
      // Dim all chips in the last response so users see it was handled.
      for (const c of body.querySelectorAll(".ais-opt")) c.classList.add("ais-opt-consumed");
      doFollowUp({ text: t("panel.optionFollowup", opt), display: opt });
    };
    body.addEventListener("click", handleOpt);
    body.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") handleOpt(e);
    });
  }

  /* ================================================
       Summary / follow-up
    ================================================ */
  async function getCfg() {
    const KEYS = ["userPrompt", "maxContentLength", "apiKey", "apiUrl", "language"];
    const got = await chrome.storage.local.get(KEYS);
    return {
      userPrompt:
        got.userPrompt ||
        "Please summarize the following webpage.\n\nTitle: {title}\n\nContent:\n{content}",
      maxContentLength: got.maxContentLength || 16000,
      apiKey: got.apiKey || "",
      apiUrl: got.apiUrl || "",
      language: got.language || "en",
    };
  }

  // Build the message we send to the model. The system & user prompts
  // are NOT translated (per design); instead we append an English line
  // telling the model what language to write its answer in. The
  // language name is always English ("Chinese", not "中文") so the
  // model reliably recognizes it.
  function buildUserMsg(userPrompt, title, content, maxLen) {
    const langName = OUTPUT_LANG_NAME[currentLang] || "English";
    const filled = userPrompt
      .replace("{title}", title)
      .replace("{content}", String(content).slice(0, maxLen));
    return `${filled}\n\nOutput the summarize text in ${langName}.`;
  }

  // Implicit-summarize state. Populated by runImplicit(); read whenever
  // the panel is opened so the user sees the current progress / result.
  // Status values: "idle" | "running" | "done" | "error"
  const implicitState = {
    status: "idle",
    text: "",          // streamed-so-far content
    error: "",
    title: "",
    contentLen: 0,
    chatHistory: [],   // becomes the seed for follow-up after panel opens
    attached: false,   // true while the visible panel is mirroring this run
  };

  async function runImplicit() {
    if (implicitState.status === "running" || implicitState.status === "done") return;
    const content = extractContent();
    const title = document.title;
    if (!content || content.length < 50) {
      implicitState.status = "error";
      implicitState.error = "Page content extraction failed or content is too short.";
      return;
    }
    const cfg = await getCfg();
    if (!cfg.apiKey && !cfg.apiUrl.includes("{key}")) {
      // Don't auto-fire without credentials.
      implicitState.status = "error";
      implicitState.error = t("panel.apiKeyMissing");
      return;
    }
    const userMsg = buildUserMsg(cfg.userPrompt, title, content, cfg.maxContentLength);
    implicitState.status = "running";
    implicitState.text = "";
    implicitState.title = title;
    implicitState.contentLen = content.length;
    implicitState.chatHistory = [{ role: "user", content: userMsg }];

    callAPI(implicitState.chatHistory, {
      onChunk(full) {
        implicitState.text = full;
        if (implicitState.attached && currentResNode) {
          currentResNode.innerHTML = renderMd(full);
          const b = $("ais-body");
          if (b) b.scrollTop = b.scrollHeight;
        }
      },
      onDone(full) {
        implicitState.status = "done";
        implicitState.text = full;
        implicitState.chatHistory.push({ role: "assistant", content: full });
        if (implicitState.attached) {
          streaming = false;
          setLoading(false);
          fullText = full;
          chatHistory = implicitState.chatHistory.slice();
          if (currentResNode) {
            currentResNode.innerHTML = renderMd(full || t("panel.emptyReply"));
            currentResNode.classList.remove("ais-cursor");
            currentResNode.removeAttribute("id");
          }
          implicitState.attached = false;
          animateMainPanelUpdate(() => {
            showChatMode();
            positionMainPanelBasedOnFab();
          });
        }
      },
      onError(err) {
        implicitState.status = "error";
        implicitState.error = String(err);
        if (implicitState.attached) {
          streaming = false;
          setLoading(false);
          setBody(`<div class="ais-err">❌ ${esc(err)}</div>`);
          $("ais-run").style.display = "";
          $("ais-run").textContent = t("panel.resummarize");
          implicitState.attached = false;
        }
      },
    });
  }

  // Render the panel body to reflect whatever the implicit run currently
  // shows. Called when the user opens the panel during/after an implicit run.
  function renderImplicitInPanel() {
    const metaEl = $("ais-meta");
    if (metaEl && implicitState.title) {
      metaEl.textContent = `📄 ${implicitState.title}  ${t("panel.metaExtracted", implicitState.contentLen)}`;
    }

    if (implicitState.status === "running") {
      // Attach the visible UI to the running call.
      implicitState.attached = true;
      streaming = true;
      fullText = implicitState.text;
      chatHistory = implicitState.chatHistory.slice();
      setLoading(true);
      setBody(
        `<div id="ais-current-res" class="ais-res ais-cursor">${
          implicitState.text ? renderMd(implicitState.text) :
          `<div class="ais-loading" style="padding:10px 0;"><div class="ais-spinner"></div> AI is analyzing...</div>`
        }</div>`,
      );
      currentResNode = $("ais-current-res");
      return;
    }
    if (implicitState.status === "done") {
      streaming = false;
      setLoading(false);
      fullText = implicitState.text;
      chatHistory = implicitState.chatHistory.slice();
      setBody(`<div class="ais-res">${renderMd(implicitState.text || t("panel.emptyReply"))}</div>`);
      currentResNode = null;
      showChatMode();
      return;
    }
    if (implicitState.status === "error") {
      streaming = false;
      setLoading(false);
      setBody(`<div class="ais-err">❌ ${esc(implicitState.error)}</div>`);
      $("ais-run").style.display = "";
      $("ais-run").textContent = t("panel.resummarize");
    }
  }

  // Triggered when the user opens the panel via the floating button.
  async function maybeAutoSummarize() {
    // Implicit mode: attach to the existing background run (running or done).
    if (implicitState.status === "running" || implicitState.status === "done" || implicitState.status === "error") {
      renderImplicitInPanel();
      return;
    }
    if (streaming) return;
    if (chatHistory.length > 0) return;
    const got = await chrome.storage.local.get("summarizeMode");
    if (got.summarizeMode === "on-open") doSummary();
  }

  async function doSummary() {
    if (streaming) return;
    // An explicit (re-)summary supersedes any implicit background run.
    // The implicit call (if any) is still holding `currentPort`, so we
    // must abort it before starting a new call — otherwise callAPI bails
    // because a port is already open and the spinner spins forever.
    if (implicitState.status === "running") abortAPI();
    implicitState.status = "idle";
    implicitState.text = "";
    implicitState.error = "";
    implicitState.chatHistory = [];
    implicitState.attached = false;
    streaming = true;
    fullText = "";
    chatHistory = [];
    $("ais-run").style.display = "";
    $("ais-run").textContent = t("panel.start");
    $("ais-chat-wrap").style.display = "none";
    setLoading(true);
    setBody(`<div class="ais-loading"><div class="ais-spinner"></div> ${esc(t("panel.extracting"))}</div>`);

    const content = extractContent();
    const title = document.title;
    if (!content || content.length < 50) {
      streaming = false;
      setLoading(false);
      setBody(`<div class="ais-err">${esc(t("panel.extractFail"))}</div>`);
      $("ais-run").style.display = "";
      return;
    }

    const cfg = await getCfg();
    const metaEl = $("ais-meta");
    if (metaEl) metaEl.textContent = `📄 ${title}  ${t("panel.metaExtracted", content.length)}`;
    const userMsg = buildUserMsg(cfg.userPrompt, title, content, cfg.maxContentLength);
    chatHistory.push({ role: "user", content: userMsg });
    setBody(`<div id="ais-current-res" class="ais-res ais-cursor"><div class="ais-loading" style="padding:10px 0;"><div class="ais-spinner"></div> ${esc(t("panel.analyzing"))}</div></div>`);
    currentResNode = $("ais-current-res");

    callAPI(chatHistory, {
      onChunk(full) {
        fullText = full;
        if (currentResNode) {
          currentResNode.innerHTML = renderMd(full);
          const b = $("ais-body");
          if (b) b.scrollTop = b.scrollHeight;
        }
      },
      onDone(full) {
        streaming = false;
        setLoading(false);
        fullText = full;
        if (currentResNode) {
          currentResNode.innerHTML = renderMd(full || t("panel.emptyReply"));
          currentResNode.classList.remove("ais-cursor");
          currentResNode.removeAttribute("id");
        }
        chatHistory.push({ role: "assistant", content: full });
        animateMainPanelUpdate(() => {
          showChatMode();
          positionMainPanelBasedOnFab();
        });
      },
      onError(err) {
        streaming = false;
        setLoading(false);
        setBody(`<div class="ais-err">❌ ${esc(err)}</div>`);
        $("ais-run").style.display = "";
        $("ais-run").textContent = t("panel.resummarize");
      },
    });
  }

  // `override` may be:
  //   - undefined  → read the input field (normal typed follow-up)
  //   - a string   → use it for both the sent message and the history bubble
  //   - an object  → { text, display }: `text` is what we send to the model,
  //                  `display` is what shows in the chat history bubble
  //                  (used for option chips: show the option label, not the
  //                   verbose template we feed the model).
  function doFollowUp(override) {
    if (streaming) return;
    const inputEl = $("ais-chat-input");
    let sendText, displayText;
    if (override == null) {
      sendText = displayText = inputEl.value;
    } else if (typeof override === "string") {
      sendText = displayText = override;
    } else {
      sendText = String(override.text ?? "");
      displayText = String(override.display ?? sendText);
    }
    sendText = sendText.trim();
    displayText = displayText.trim();
    if (!sendText) return;

    if (override == null) inputEl.value = "";
    streaming = true;
    fullText = "";
    setLoading(true);
    const b = $("ais-body");
    b.insertAdjacentHTML(
      "beforeend",
      `<div class="ais-user-msg">👤 ${esc(displayText)}</div><div id="ais-current-res" class="ais-res ais-cursor">${esc(t("panel.thinking"))}</div>`,
    );
    currentResNode = $("ais-current-res");
    b.scrollTop = b.scrollHeight;
    chatHistory.push({ role: "user", content: sendText });

    callAPI(chatHistory, {
      onChunk(full) {
        fullText = full;
        if (currentResNode) {
          currentResNode.innerHTML = renderMd(full);
          if (b) b.scrollTop = b.scrollHeight;
        }
      },
      onDone(full) {
        streaming = false;
        setLoading(false);
        fullText = full;
        if (currentResNode) {
          currentResNode.innerHTML = renderMd(full || t("panel.emptyReply"));
          currentResNode.classList.remove("ais-cursor");
          currentResNode.removeAttribute("id");
          if (b) b.scrollTop = b.scrollHeight;
        }
        chatHistory.push({ role: "assistant", content: full });
        showChatMode();
      },
      onError(err) {
        streaming = false;
        setLoading(false);
        if (currentResNode) {
          currentResNode.outerHTML = `<div class="ais-err" style="margin-top:10px;">❌ ${esc(err)}</div>`;
          if (b) b.scrollTop = b.scrollHeight;
        }
        chatHistory.pop();
        // Only repopulate the input for typed follow-ups; option chips
        // should not dump their wrapped prompt back into the textbox.
        if (override == null) inputEl.value = displayText;
        showChatMode();
      },
    });
  }

  /* ================================================
       Init
    ================================================ */
  async function init() {
    // Load language before any UI is built so first paint is correct.
    const langGot = await chrome.storage.local.get("language");
    currentLang = (langGot.language && I18N[langGot.language]) ? langGot.language : "en";

    // React to options-page language changes without reloading the tab.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.language) return;
      const next = changes.language.newValue;
      if (!next || !I18N[next] || next === currentLang) return;
      currentLang = next;
      const fabEl = $("ais-fab");
      if (fabEl) fabEl.title = t("panel.fabTitle");
      const mainEl = $("ais-main");
      if (mainEl) applyI18nIn(mainEl);
      // If the current Re-summarize/Start text is showing, refresh it.
      const runBtn = $("ais-run");
      if (runBtn && !streaming) {
        // Choose the right label based on what state we're in.
        const showResum = chatHistory.length > 0 || implicitState.status === "done" || implicitState.status === "error";
        runBtn.textContent = t(showResum ? "panel.resummarize" : "panel.start");
      }
    });

    const wrap = document.createElement("div");
    wrap.id = "ais-fab-wrap";
    const fab = document.createElement("button");
    fab.id = "ais-fab";
    fab.title = t("panel.fabTitle");
    fab.textContent = "📍";
    Object.assign(fab.style, { position: "absolute" });

    const stored = await chrome.storage.local.get("fab_position");
    const pos = stored.fab_position;
    if (pos && pos.xRatio !== undefined && pos.yRatio !== undefined) {
      fab.style.left = pos.xRatio * window.innerWidth + "px";
      fab.style.top = pos.yRatio * window.innerHeight + "px";
    } else {
      // First install: anchor the fab near the bottom-right, with a 10%
      // gap between the fab's bottom edge and the viewport bottom. Using
      // an absolute `top` (instead of `bottom`) is important — later
      // animateTo() calls set `bottom: auto`, so a `bottom`-based anchor
      // would cause the fab to fall to top:0 on the first hover.
      fab.style.left = ""; // let snapInstant derive from rect after layout
      fab.style.right = FAB_DEFAULT_OFFSET + "px";
      // Measured after mount; for now assume the configured fab size.
      // A followup rAF will correct once offsetHeight is real.
      fab.style.top = Math.round(window.innerHeight * 0.9 - 35) + "px";
    }
    wrap.appendChild(fab);
    document.body.appendChild(wrap);

    // Initial placement: snap to nearest edge without animation.
    const snapInstant = (preserveSide = false) => {
      const rect = fab.getBoundingClientRect();
      const storedSide = window.snapSide === "left" || window.snapSide === "right" ? window.snapSide : null;
      const isLeft = preserveSide && storedSide
        ? storedSide === "left"
        : rect.left + rect.width / 2 < window.innerWidth / 2;
      window.snapSide = isLeft ? "left" : "right";
      fab.style.transition = "none";
      const vR = window.innerWidth - (window.innerWidth - document.documentElement.clientWidth);
      fab.style.left =
        (isLeft
          ? -(fab.offsetWidth - FAB_PEEK_VISIBLE)
          : vR - FAB_PEEK_VISIBLE) + "px";
      // Always pin `top` too, so subsequent animateTo() calls (which set
      // right:auto, bottom:auto) have a concrete top to anchor against.
      // Without this the fab can fall to top:0 on the first hover when it
      // was originally positioned via `bottom`.
      if (!fab.style.top) fab.style.top = rect.top + "px";
      fab.style.right = "auto";
      fab.style.bottom = "auto";
    };

    window.addEventListener("resize", async () => {
      const got = await chrome.storage.local.get("fab_position");
      const p = got.fab_position;
      if (p && p.yRatio !== undefined) {
        fab.style.transition = "none";
        fab.style.top = p.yRatio * window.innerHeight + "px";
      }
      snapInstant(true);
    });

    // Wait one frame so fab.offsetWidth is measured correctly.
    requestAnimationFrame(snapInstant);

    const mainPanel = createMainPanel();
    document.body.appendChild(mainPanel);

    bindFabEvents(fab);
    bindMainEvents();
    makeDraggable("ais-main");
    installPanelViewportClamp(mainPanel);

    // Schedule background implicit summary if configured.
    const cfgGot = await chrome.storage.local.get("summarizeMode");
    if (cfgGot.summarizeMode === "implicit") scheduleImplicitRun();
  }

  function scheduleImplicitRun() {
    let tabComplete = false;
    let fired = false;

    const cleanup = () => {
      document.removeEventListener("readystatechange", onReadyState);
      window.removeEventListener("load", onReadyState);
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    };
    const fireWhenReady = () => {
      if (fired || !tabComplete || document.readyState !== "complete") return;
      fired = true;
      cleanup();
      requestAnimationFrame(runImplicit);
    };
    const reportReadyState = () => {
      chrome.runtime
        .sendMessage({ type: "content-ready-state", readyState: document.readyState })
        .then((res) => {
          if (res?.tabStatus === "complete") tabComplete = true;
          fireWhenReady();
        })
        .catch(() => {});
    };
    function onReadyState() {
      reportReadyState();
      fireWhenReady();
    }
    function onRuntimeMessage(msg) {
      if (msg?.type !== "tab-status") return;
      if (msg.status === "complete") {
        tabComplete = true;
        fireWhenReady();
      }
    }

    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    document.addEventListener("readystatechange", onReadyState);
    window.addEventListener("load", onReadyState, { once: true });
    reportReadyState();
  }

  /* ================================================
       Messages from popup / context menu
    ================================================ */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "open-and-summarize") {
      panelOpen = true;
      positionMainPanelBasedOnFab();
      toggle("ais-main", true);
      doSummary();
    } else if (msg?.type === "open-panel") {
      panelOpen = true;
      positionMainPanelBasedOnFab();
      toggle("ais-main", true);
    }
  });

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
