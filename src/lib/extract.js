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

function cleanText(t) {
  return String(t || "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractContent() {
  try {
    const clone = document.documentElement.cloneNode(true);
    for (const sel of STRIP_SEL) {
      try {
        clone.querySelectorAll(sel).forEach((e) => e.remove());
      } catch {}
    }
    for (const sel of CONTENT_SEL) {
      const el = clone.querySelector(sel);
      if (el) {
        const t = (el.textContent || "").trim();
        if (t.length > 300) return cleanText(t);
      }
    }
    const body = clone.querySelector("body");
    return cleanText(
      body?.innerText || body?.textContent || document.body.textContent || "",
    );
  } catch {
    return cleanText(document.body.textContent || "");
  }
}
