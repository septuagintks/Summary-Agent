/*
 * Content script for AI Summary extension.
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
  const SNAP_PEEK_L = 8;
  const SNAP_PEEK_R = 12;
  const scrollbarW = () => window.innerWidth - document.documentElement.clientWidth;
  const PANEL_W = 420;
  const MARGIN = 10;

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
          const t = (el.innerText || el.textContent || "").trim();
          if (t.length > 300) return cleanText(t);
        }
      }
      const body = clone.querySelector("body");
      return cleanText(body?.innerText || body?.textContent || document.body.textContent || "");
    } catch {
      return cleanText(document.body.textContent || "");
    }
  }

  /* ================================================
       Markdown rendering
    ================================================ */
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

  /* ================================================
       AI call (port to service worker)
    ================================================ */
  let currentPort = null;

  function callAPI(messages, { onChunk, onDone, onError }) {
    if (currentPort) return;
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
        <span class="ais-hd-title">🤖 AI Content Summary & Chat</span>
        <button class="ais-hbtn" id="ais-copy">📋 Copy</button>
        <button class="ais-hbtn" id="ais-cfg-open">⚙️ Settings</button>
        <button class="ais-hbtn" id="ais-main-close">✕</button>
      </div>
      <div class="ais-meta" id="ais-meta">${esc(document.title)}</div>
      <div class="ais-body" id="ais-body">
        <div class="ais-ph">Click the "Start Summary" button below<br>AI will automatically extract and analyze current page content 📖</div>
      </div>
      <div class="ais-ft" id="ais-ft-actions">
        <button class="ais-btn ais-danger" id="ais-stop" style="display:none">⏹ Stop</button>
        <button class="ais-btn ais-primary" id="ais-run">✨ Start Summary</button>
        <div class="ais-chat-wrap" id="ais-chat-wrap" style="display:none;">
          <button class="ais-btn ais-secondary ais-btn-square" id="ais-re-run" title="Re-summarize">🔄</button>
          <input type="text" class="ais-chat-input" id="ais-chat-input" placeholder="Enter follow-up question, press Enter to send...">
          <button class="ais-btn ais-primary ais-btn-square" id="ais-chat-send" title="Send">⬆️</button>
        </div>
      </div>
    `;
    return panel;
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
       Position main panel relative to the fab
    ================================================ */
  function positionMainPanelBasedOnFab() {
    const fab = $("ais-fab");
    const mainPanel = $("ais-main");
    if (!fab || !mainPanel) return;
    const fabRect = fab.getBoundingClientRect();
    const isLeft = fabRect.left < window.innerWidth / 2;

    mainPanel.style.right = "auto";
    mainPanel.style.bottom = "auto";

    let leftPos = isLeft ? fabRect.right + 15 : fabRect.left - PANEL_W - 15;
    leftPos = Math.max(MARGIN, Math.min(window.innerWidth - PANEL_W - MARGIN, leftPos));
    mainPanel.style.left = leftPos + "px";

    const panelHeight = mainPanel.offsetHeight || PANEL_W;
    let topPos = Math.max(MARGIN, Math.min(window.innerHeight - panelHeight - MARGIN, fabRect.top));
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
      const maxTop = window.innerHeight - rect.height - MARGIN;
      const minTop = MARGIN;
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
       - All position/transition writes go through fab.style here.
       - The CSS does NOT animate `left`/`top`; only JS does, scoped per move.
       - Snap is a single one-shot transition guarded by `snapping`, so a
         late mouseleave/mouseenter cannot restart it midway.
    ================================================ */
  const FAB_EASE_SNAP = "cubic-bezier(0.16, 0.84, 0.32, 1.08)"; // slow→fast→tiny overshoot
  const FAB_EASE_PEEK = "cubic-bezier(0.22, 1, 0.36, 1)";       // gentle ease-out for hover
  const FAB_DUR_SNAP = 420;
  const FAB_DUR_PEEK = 240;
  const FAB_DRAG_DUR = 80;

  function bindFabEvents(fab) {
    const DRAG_THRESHOLD = 8;
    let state = "idle"; // idle | pressing | dragging | hovering | snapping
    let pointerId = null;
    let downX = 0, downY = 0;
    let offX = 0, offY = 0;
    let snapEndTimer = null;
    let leaveTimer = null;

    const snapLeftX = () => -(fab.offsetWidth - SNAP_PEEK_L) + MARGIN;
    const snapRightX = () => window.innerWidth - SNAP_PEEK_R - MARGIN - scrollbarW();
    const peekLeftX = () => 15;
    const peekRightX = () => window.innerWidth - fab.offsetWidth - 15;
    const currentSide = () => {
      const r = fab.getBoundingClientRect();
      return r.left + r.width / 2 < window.innerWidth / 2 ? "left" : "right";
    };

    function setTransition(value) {
      // We own these properties from JS — write the literal string so it
      // can be cleared with `none` and not merged with CSS shorthand.
      fab.style.transition = value;
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

    function startSnap() {
      state = "snapping";
      window.snapSide = currentSide();
      const targetX = window.snapSide === "left" ? snapLeftX() : snapRightX();
      animateTo(targetX, null, FAB_DUR_SNAP, FAB_EASE_SNAP, () => {
        state = "idle";
      });
    }

    function startPeek() {
      // Called when the pointer enters the fab while it's resting (snapped).
      state = "hovering";
      const targetX = currentSide() === "left" ? peekLeftX() : peekRightX();
      animateTo(targetX, null, FAB_DUR_PEEK, FAB_EASE_PEEK);
    }

    function endPeek() {
      // After hover, snap back to edge with a softer curve (no overshoot).
      state = "snapping";
      const targetX = currentSide() === "left" ? snapLeftX() : snapRightX();
      animateTo(targetX, null, FAB_DUR_PEEK + 60, FAB_EASE_PEEK, () => {
        state = "idle";
      });
    }

    /* ---- Pointer interaction (replaces mousedown/mousemove/mouseup mix) ---- */
    fab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // Cancel any in-flight snap/peek; we own the fab now.
      if (snapEndTimer) { clearTimeout(snapEndTimer); snapEndTimer = null; }
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }

      state = "pressing";
      pointerId = e.pointerId;
      try { fab.setPointerCapture(pointerId); } catch {}

      const rect = fab.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      downX = e.clientX;
      downY = e.clientY;
      // Freeze current position; from here on we drive transitions.
      fab.style.left = rect.left + "px";
      fab.style.top = rect.top + "px";
      fab.style.right = "auto";
      fab.style.bottom = "auto";
      setTransition("transform .12s ease-out");
      fab.classList.add("ais-fab-pressing");
    });

    fab.addEventListener("pointermove", (e) => {
      if (state !== "pressing" && state !== "dragging") return;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (state === "pressing") {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        state = "dragging";
        fab.classList.remove("ais-fab-pressing");
        setTransition(`left ${FAB_DRAG_DUR}ms ease-out, top ${FAB_DRAG_DUR}ms ease-out`);
      }
      const left = Math.max(10, Math.min(window.innerWidth - fab.offsetWidth - 10, e.clientX - offX));
      const top = Math.max(10, Math.min(window.innerHeight - fab.offsetHeight - 10, e.clientY - offY));
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
        // Click: toggle the panel. No snap, no peek interference.
        state = "idle";
        setTransition("none");
        fab.classList.remove("ais-fab-clicking");
        // force reflow so the animation restarts
        void fab.offsetWidth;
        fab.classList.add("ais-fab-clicking");
        fab.addEventListener("animationend",
          () => fab.classList.remove("ais-fab-clicking"),
          { once: true });
        panelOpen = !panelOpen;
        if (panelOpen) positionMainPanelBasedOnFab();
        toggle("ais-main", panelOpen);
        return;
      }

      // Dragging → persist + snap (single animation, not interruptible
      // by pointerleave because we suppress that path in `snapping` state).
      const rect = fab.getBoundingClientRect();
      chrome.storage.local.set({
        fab_position: {
          xRatio: rect.left / window.innerWidth,
          yRatio: rect.top / window.innerHeight,
        },
      });
      startSnap();
    });

    fab.addEventListener("pointercancel", () => {
      releasePointer();
      if (state === "dragging") startSnap();
      else { state = "idle"; setTransition("none"); }
      fab.classList.remove("ais-fab-pressing");
    });

    /* ---- Hover peek (only when idle) ---- */
    fab.addEventListener("pointerenter", (e) => {
      // Ignore the synthetic enter we get after a touch/pointer release.
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (state !== "idle") return;
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      startPeek();
    });

    fab.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (state !== "hovering") return;
      // Short debounce so users moving along the edge don't trigger
      // snap-back/peek-out flicker.
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        leaveTimer = null;
        if (state !== "hovering") return;
        endPeek();
      }, 100);
    });
  }

  /* ================================================
       Main panel events
    ================================================ */
  function bindMainEvents() {
    $("ais-main-close").addEventListener("click", () => {
      panelOpen = false;
      toggle("ais-main", false);
    });
    $("ais-cfg-open").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-options" }).catch(() => {});
    });
    $("ais-copy").addEventListener("click", () => {
      if (!fullText) { showToast("No content to copy"); return; }
      navigator.clipboard.writeText(fullText)
        .then(() => showToast("✓ Copied to clipboard", "#16a34a"))
        .catch(() => showToast("Copy failed, please select manually"));
    });
    $("ais-stop").addEventListener("click", () => {
      abortAPI();
      streaming = false;
      setLoading(false);
      if (currentResNode) {
        currentResNode.innerHTML = renderMd(fullText || "Manually stopped");
        currentResNode.classList.remove("ais-cursor");
        currentResNode.removeAttribute("id");
      }
      if (chatHistory.length > 0) {
        if (fullText) chatHistory.push({ role: "assistant", content: fullText });
        $("ais-run").style.display = "none";
        $("ais-chat-wrap").style.display = "flex";
      } else {
        $("ais-run").style.display = "";
        $("ais-run").textContent = "🔄 Re-summarize";
      }
    });
    $("ais-run").addEventListener("click", doSummary);
    $("ais-re-run").addEventListener("click", doSummary);
    $("ais-chat-send").addEventListener("click", doFollowUp);
    $("ais-chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doFollowUp(); }
    });
  }

  /* ================================================
       Summary / follow-up
    ================================================ */
  async function getCfg() {
    const KEYS = ["userPrompt", "maxContentLength", "apiKey", "apiUrl"];
    const got = await chrome.storage.local.get(KEYS);
    return {
      userPrompt:
        got.userPrompt ||
        "Please summarize the following webpage.\n\nTitle: {title}\n\nContent:\n{content}",
      maxContentLength: got.maxContentLength || 16000,
      apiKey: got.apiKey || "",
      apiUrl: got.apiUrl || "",
    };
  }

  async function doSummary() {
    if (streaming) return;
    streaming = true;
    fullText = "";
    chatHistory = [];
    $("ais-run").style.display = "";
    $("ais-run").textContent = "✨ Start Summary";
    $("ais-chat-wrap").style.display = "none";
    setLoading(true);
    setBody(`<div class="ais-loading"><div class="ais-spinner"></div> Extracting page content...</div>`);

    const content = extractContent();
    const title = document.title;
    if (!content || content.length < 50) {
      streaming = false;
      setLoading(false);
      setBody(`<div class="ais-err">❌ Page content extraction failed or content is too short.</div>`);
      $("ais-run").style.display = "";
      return;
    }

    const cfg = await getCfg();
    const metaEl = $("ais-meta");
    if (metaEl) metaEl.textContent = `📄 ${title}  ·  Extracted ${content.length} chars`;
    const userMsg = cfg.userPrompt
      .replace("{title}", title)
      .replace("{content}", String(content).slice(0, cfg.maxContentLength));
    chatHistory.push({ role: "user", content: userMsg });
    setBody(`<div id="ais-current-res" class="ais-res ais-cursor"><div class="ais-loading" style="padding:10px 0;"><div class="ais-spinner"></div> AI is analyzing...</div></div>`);
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
          currentResNode.innerHTML = renderMd(full || "(AI returned empty content)");
          currentResNode.classList.remove("ais-cursor");
          currentResNode.removeAttribute("id");
        }
        chatHistory.push({ role: "assistant", content: full });
        showChatMode();
        positionMainPanelBasedOnFab();
      },
      onError(err) {
        streaming = false;
        setLoading(false);
        setBody(`<div class="ais-err">❌ ${esc(err)}</div>`);
        $("ais-run").style.display = "";
        $("ais-run").textContent = "🔄 Re-summarize";
      },
    });
  }

  function doFollowUp() {
    if (streaming) return;
    const inputEl = $("ais-chat-input");
    const question = inputEl.value.trim();
    if (!question) return;

    inputEl.value = "";
    streaming = true;
    fullText = "";
    setLoading(true);
    const b = $("ais-body");
    b.insertAdjacentHTML(
      "beforeend",
      `<div class="ais-user-msg">👤 ${esc(question)}</div><div id="ais-current-res" class="ais-res ais-cursor">Thinking...</div>`,
    );
    currentResNode = $("ais-current-res");
    b.scrollTop = b.scrollHeight;
    chatHistory.push({ role: "user", content: question });

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
          currentResNode.innerHTML = renderMd(full || "(AI returned empty content)");
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
        inputEl.value = question;
        showChatMode();
      },
    });
  }

  /* ================================================
       Init
    ================================================ */
  async function init() {
    const wrap = document.createElement("div");
    wrap.id = "ais-fab-wrap";
    const fab = document.createElement("button");
    fab.id = "ais-fab";
    fab.title = "AI Content Summary";
    fab.textContent = "📍";
    Object.assign(fab.style, { position: "absolute" });

    const stored = await chrome.storage.local.get("fab_position");
    const pos = stored.fab_position;
    if (pos && pos.xRatio !== undefined && pos.yRatio !== undefined) {
      fab.style.left = pos.xRatio * window.innerWidth + "px";
      fab.style.top = pos.yRatio * window.innerHeight + "px";
    } else {
      fab.style.right = "22px";
      fab.style.bottom = "22px";
    }
    wrap.appendChild(fab);
    document.body.appendChild(wrap);

    // Initial placement: snap to nearest edge without animation.
    const snapInstant = () => {
      const rect = fab.getBoundingClientRect();
      const isLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
      window.snapSide = isLeft ? "left" : "right";
      fab.style.transition = "none";
      fab.style.left =
        (isLeft
          ? -(fab.offsetWidth - SNAP_PEEK_L) + MARGIN
          : window.innerWidth - SNAP_PEEK_R - MARGIN - scrollbarW()) + "px";
    };

    window.addEventListener("resize", async () => {
      const got = await chrome.storage.local.get("fab_position");
      const p = got.fab_position;
      if (p && p.yRatio !== undefined) {
        fab.style.transition = "none";
        fab.style.top = p.yRatio * window.innerHeight + "px";
      }
      snapInstant();
    });

    // Wait one frame so fab.offsetWidth is measured correctly.
    requestAnimationFrame(snapInstant);

    const mainPanel = createMainPanel();
    document.body.appendChild(mainPanel);

    bindFabEvents(fab);
    bindMainEvents();
    makeDraggable("ais-main");
    installPanelViewportClamp(mainPanel);
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
