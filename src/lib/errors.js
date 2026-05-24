import { makeT } from "./i18n.js";

// Structured error types for Summary Agent.
// Distinguishes retryable from non-retryable errors so the retry layer
// in background.js knows when to back off and try again.

export const ErrorCodes = {
  // Retryable
  NETWORK_ERROR: "NETWORK_ERROR",
  RATE_LIMIT: "RATE_LIMIT",
  SERVER_ERROR: "SERVER_ERROR",
  TIMEOUT: "TIMEOUT",
  STREAM_READ_ERROR: "STREAM_READ_ERROR",

  // Non-retryable
  AUTH_ERROR: "AUTH_ERROR",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_MODEL: "INVALID_MODEL",
  CONTENT_TOO_LONG: "CONTENT_TOO_LONG",
  CONFIG_ERROR: "CONFIG_ERROR",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
};

const RETRYABLE = new Set([
  ErrorCodes.NETWORK_ERROR,
  ErrorCodes.RATE_LIMIT,
  ErrorCodes.SERVER_ERROR,
  ErrorCodes.TIMEOUT,
  ErrorCodes.STREAM_READ_ERROR,
]);

export class ApiError extends Error {
  constructor(message, code, statusCode = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = RETRYABLE.has(code);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
    };
  }
}

// Map an HTTP response to an ApiError. Tries to extract a useful message
// from common provider error shapes before falling back to "HTTP {status}".
export function classifyHttpError(statusCode, responseText, lang = "en") {
  const t = makeT(lang);
  let providerMessage = "";
  try {
    const parsed = JSON.parse(responseText);
    providerMessage =
      parsed?.error?.message ||
      parsed?.error?.code ||
      parsed?.message ||
      "";
  } catch {}

  if (statusCode === 401 || statusCode === 403) {
    const baseMessage = providerMessage || (lang === "en" ? `HTTP ${statusCode}` : t("error.auth"));
    return new ApiError(baseMessage, ErrorCodes.AUTH_ERROR, statusCode);
  }
  if (statusCode === 429) {
    const baseMessage = providerMessage || (lang === "en" ? `HTTP ${statusCode}` : t("error.rateLimit"));
    return new ApiError(baseMessage, ErrorCodes.RATE_LIMIT, statusCode);
  }
  if (statusCode >= 500) {
    const baseMessage = providerMessage || (lang === "en" ? `HTTP ${statusCode}` : t("error.serverError"));
    return new ApiError(baseMessage, ErrorCodes.SERVER_ERROR, statusCode);
  }
  if (statusCode === 400) {
    const baseMessage = providerMessage || (lang === "en" ? `HTTP ${statusCode}` : t("error.invalidRequest"));
    return new ApiError(baseMessage, ErrorCodes.INVALID_REQUEST, statusCode);
  }
  if (statusCode === 404) {
    const baseMessage = providerMessage || (lang === "en" ? `HTTP ${statusCode}` : t("error.invalidModel"));
    return new ApiError(baseMessage, ErrorCodes.INVALID_MODEL, statusCode);
  }
  const baseMessage = providerMessage || (lang === "en" ? `HTTP ${statusCode}` : `${t("error.network")} (HTTP ${statusCode})`);
  return new ApiError(baseMessage, ErrorCodes.NETWORK_ERROR, statusCode);
}

// Wrap a non-HTTP fetch failure (DNS, abort, network unreachable) into ApiError.
export function classifyNetworkError(err, lang = "en") {
  const t = makeT(lang);
  if (err?.name === "AbortError") {
    return new ApiError(lang === "en" ? "Request aborted" : t("error.aborted"), ErrorCodes.NETWORK_ERROR);
  }
  if (err?.name === "TimeoutError") {
    return new ApiError(lang === "en" ? "Request timed out" : t("error.timeout"), ErrorCodes.TIMEOUT);
  }
  return new ApiError(
    err?.message || (lang === "en" ? "Network error" : t("error.network")),
    ErrorCodes.NETWORK_ERROR
  );
}
