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

const MIN_CONTENT_LENGTH = 50;
const MAX_CONTENT_LENGTH = 100000;

function cleanText(t) {
  return String(t || "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Validate extracted content: must be a non-empty string of sufficient length.
function validateContent(content) {
  if (typeof content !== "string") return { valid: false, reason: "Content is not a string" };
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    return { valid: false, reason: `Content too short (${trimmed.length} chars, minimum ${MIN_CONTENT_LENGTH})` };
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    return { valid: false, reason: `Content too long (${trimmed.length} chars, maximum ${MAX_CONTENT_LENGTH})` };
  }
  // Check for content that is mostly whitespace or garbage
  const textChars = trimmed.replace(/[\s\n\r\t]+/g, "");
  if (textChars.length < 10) {
    return { valid: false, reason: "Content is mostly whitespace or empty" };
  }
  return { valid: true };
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
        if (t.length > 300) {
          const cleaned = cleanText(t);
          const validation = validateContent(cleaned);
          if (validation.valid) return cleaned;
        }
      }
    }
    const body = clone.querySelector("body");
    const raw = cleanText(
      body?.innerText || body?.textContent || document.body.textContent || "",
    );
    const validation = validateContent(raw);
    if (validation.valid) return raw;
    return validation.reason;
  } catch {
    try {
      const raw = cleanText(document.body.textContent || "");
      const validation = validateContent(raw);
      if (validation.valid) return raw;
      return validation.reason;
    } catch {
      return "Failed to extract page content";
    }
  }
}

// Convenience: extract and validate in one call, returning { content, valid, reason }.
export function extractAndValidate() {
  const content = extractContent();
  const validation = validateContent(content);
  if (validation.valid) return { content, valid: true };
  return { content, valid: false, reason: validation.reason };
}
