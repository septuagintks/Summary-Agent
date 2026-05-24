import { describe, it, expect } from "vitest";
import {
  completeUrlForCompat,
  detectProvider,
  isResponsesModel,
  COMPAT_VALUES,
} from "../providers.js";

// ──────────────────────────────────────────────
// completeUrlForCompat — URL auto-completion logic
// ──────────────────────────────────────────────
describe("completeUrlForCompat", () => {
  // ----- null/edge cases -----
  it("returns undefined/null as-is", () => {
    expect(completeUrlForCompat(undefined, "openai")).toBe(undefined);
    expect(completeUrlForCompat(null, "openai")).toBe(null);
  });

  it("returns url unchanged for unknown compat", () => {
    const url = "https://api.example.com/v1/chat";
    expect(completeUrlForCompat(url, "unknown")).toBe(url);
  });

  it("returns url unchanged if URL constructor fails", () => {
    const url = "not-a-valid-url";
    expect(completeUrlForCompat(url, "openai")).toBe(url);
  });

  // ----- already complete URLs -----
  it("does not modify a URL that already ends with the openai tail", () => {
    const url = "https://api.openai.com/v1/chat/completions";
    expect(completeUrlForCompat(url, "openai")).toBe(url);
  });

  it("does not modify a URL that already ends with anthropic tail", () => {
    const url = "https://api.anthropic.com/v1/messages";
    expect(completeUrlForCompat(url, "anthropic")).toBe(url);
  });

  it("does not modify a URL that already ends with openai-responses tail", () => {
    const url = "https://api.openai.com/v1/responses";
    expect(completeUrlForCompat(url, "openai-responses")).toBe(url);
  });

  it("does not modify a Gemini URL with placeholders intact", () => {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}";
    expect(completeUrlForCompat(url, "gemini")).toBe(url);
  });

  // ----- bare host -----
  it("appends fallback base + tail for bare host (openai)", () => {
    const url = "https://api.openai.com";
    expect(completeUrlForCompat(url, "openai")).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
  });

  it("appends fallback base + tail for bare host (anthropic)", () => {
    const url = "https://api.anthropic.com";
    expect(completeUrlForCompat(url, "anthropic")).toBe(
      "https://api.anthropic.com/v1/messages"
    );
  });

  it("appends fallback base + tail for bare host (gemini)", () => {
    const url = "https://generativelanguage.googleapis.com";
    expect(completeUrlForCompat(url, "gemini")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    );
  });

  // ----- /v1 only -----
  it("appends tail to /v1 for openai", () => {
    const url = "https://api.openai.com/v1";
    expect(completeUrlForCompat(url, "openai")).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
  });

  it("appends tail to /v1 for anthropic", () => {
    const url = "https://api.anthropic.com/v1";
    expect(completeUrlForCompat(url, "anthropic")).toBe(
      "https://api.anthropic.com/v1/messages"
    );
  });

  it("appends tail to /v1/ (trailing slash) for openai", () => {
    const url = "https://api.openai.com/v1/";
    // trailing slash stripped, then tail appended
    expect(completeUrlForCompat(url, "openai")).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
  });

  // ----- various path prefixes -----
  it("appends tail to /api/v1 prefix", () => {
    const url = "https://api.example.com/api/v1";
    expect(completeUrlForCompat(url, "openai")).toBe(
      "https://api.example.com/api/v1/chat/completions"
    );
  });

  it("appends tail to /openai/v1 prefix", () => {
    const url = "https://gateway.example.com/openai/v1";
    expect(completeUrlForCompat(url, "openai")).toBe(
      "https://gateway.example.com/openai/v1/chat/completions"
    );
  });

  it("appends tail to /v1beta (non-standard) for openai", () => {
    const url = "https://api.example.com/v1beta";
    expect(completeUrlForCompat(url, "openai")).toBe(
      "https://api.example.com/v1beta/chat/completions"
    );
  });

  // ════════════════════════════════════════════════
  // FIX C2: URL partial path bug
  // ════════════════════════════════════════════════
  // Previously, if a user entered "/v1/chat" (partial tail path),
  // the function would append "/chat/completions" on top,
  // resulting in "/v1/chat/chat/completions".
  // The fix: check if all tail segments are already present in the path.
  describe("C2 fix: partial tail path should not cause duplication", () => {
    it("does NOT double the /chat segment when path ends with /v1/chat (openai)", () => {
      const url = "https://api.openai.com/v1/chat";
      // /v1/chat already has "chat" (first segment of "/chat/completions")
      // So it should be completed to /v1/chat/completions
      expect(completeUrlForCompat(url, "openai")).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("does NOT double the /messages segment when path ends with /v1/messages (anthropic)", () => {
      const url = "https://api.anthropic.com/v1/messages";
      expect(completeUrlForCompat(url, "anthropic")).toBe(url);
    });

    it("does NOT double when path is /v1/responses (openai-responses)", () => {
      const url = "https://api.openai.com/v1/responses";
      expect(completeUrlForCompat(url, "openai-responses")).toBe(url);
    });

    it("does NOT append when path contains a sub-path of tail with extra segments", () => {
      // Path has "chat" in the middle of "api/v1beta/chat" for openai
      const url = "https://api.example.com/api/v1beta/chat";
      expect(completeUrlForCompat(url, "openai")).toBe("https://api.example.com/api/v1beta/chat/completions");
    });
  });

  // ----- custom/exotic paths -----
  it("appends tail to deep path for openai", () => {
    const url = "https://api.deepseek.com/foo/bar";
    expect(completeUrlForCompat(url, "openai")).toBe(
      "https://api.deepseek.com/foo/bar/chat/completions"
    );
  });

  it("preserves query string when appending tail", () => {
    const url = "https://api.example.com/v1?param=1";
    expect(completeUrlForCompat(url, "openai")).toBe(
      "https://api.example.com/v1/chat/completions?param=1"
    );
  });

  it("preserves query string on already-complete URLs", () => {
    const url = "https://api.openai.com/v1/chat/completions?model=gpt-4";
    expect(completeUrlForCompat(url, "openai")).toBe(url);
  });
});

// ──────────────────────────────────────────────
// detectProvider
// ──────────────────────────────────────────────
describe("detectProvider", () => {
  it("returns compatOverride when valid", () => {
    expect(detectProvider("https://example.com/v1", "", "anthropic")).toBe("anthropic");
    expect(detectProvider("https://example.com/v1", "", "gemini")).toBe("gemini");
  });

  it("ignores invalid compatOverride", () => {
    const url = "https://api.openai.com/v1";
    expect(detectProvider(url, "", "bogus")).toBe("openai");
  });

  it("detects anthropic from URL", () => {
    expect(detectProvider("https://api.anthropic.com/v1/messages")).toBe("anthropic");
  });

  it("detects gemini from URL", () => {
    expect(detectProvider("https://generativelanguage.googleapis.com/v1beta/models/x")).toBe("gemini");
  });

  it("detects openai-responses from URL containing /v1/responses", () => {
    expect(detectProvider("https://api.openai.com/v1/responses")).toBe("openai-responses");
  });

  it("detects openai-responses for gpt-5 model on openai host", () => {
    expect(detectProvider("https://api.openai.com/v1/chat/completions", "gpt-5.5")).toBe("openai-responses");
  });

  it("does NOT upgrade gpt-5 on non-openai host (e.g. OpenRouter)", () => {
    expect(detectProvider("https://openrouter.ai/api/v1/chat/completions", "gpt-5.5")).toBe("openai");
  });

  it("defaults to openai for unknown URLs", () => {
    expect(detectProvider("https://api.example.com/v1/chat/completions")).toBe("openai");
  });
});

// ──────────────────────────────────────────────
// isResponsesModel
// ──────────────────────────────────────────────
describe("isResponsesModel", () => {
  it("returns true for gpt-5 models", () => {
    expect(isResponsesModel("gpt-5.5")).toBe(true);
    expect(isResponsesModel("gpt-5.4")).toBe(true);
    expect(isResponsesModel("gpt-5.4-mini")).toBe(true);
    expect(isResponsesModel("gpt-5-some-custom")).toBe(true);
  });

  it("returns false for non-gpt-5 models", () => {
    expect(isResponsesModel("gpt-4o")).toBe(false);
    expect(isResponsesModel("claude-opus-4.7")).toBe(false);
    expect(isResponsesModel("gemini-2.5-pro")).toBe(false);
    expect(isResponsesModel("")).toBe(false);
  });
});

// ──────────────────────────────────────────────
// COMPAT_VALUES
// ──────────────────────────────────────────────
describe("COMPAT_VALUES", () => {
  it("contains all expected compatibility formats", () => {
    expect(COMPAT_VALUES).toEqual(["openai", "openai-responses", "anthropic", "gemini"]);
  });
});
