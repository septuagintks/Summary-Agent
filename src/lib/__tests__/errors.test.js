import { describe, it, expect } from "vitest";
import {
  ApiError,
  ErrorCodes,
  classifyHttpError,
  classifyNetworkError,
} from "../errors.js";

// ──────────────────────────────────────────────
// ApiError class
// ──────────────────────────────────────────────
describe("ApiError", () => {
  it("creates an error with the given message and code", () => {
    const err = new ApiError("Something went wrong", ErrorCodes.NETWORK_ERROR);
    expect(err.message).toBe("Something went wrong");
    expect(err.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(err.name).toBe("ApiError");
  });

  it("marks retryable errors correctly", () => {
    const retryableCodes = [
      ErrorCodes.NETWORK_ERROR,
      ErrorCodes.RATE_LIMIT,
      ErrorCodes.SERVER_ERROR,
      ErrorCodes.TIMEOUT,
      ErrorCodes.STREAM_READ_ERROR,
    ];
    for (const code of retryableCodes) {
      expect(new ApiError("test", code).retryable).toBe(true);
    }
  });

  it("marks non-retryable errors correctly", () => {
    const nonRetryableCodes = [
      ErrorCodes.AUTH_ERROR,
      ErrorCodes.INVALID_REQUEST,
      ErrorCodes.INVALID_MODEL,
      ErrorCodes.CONTENT_TOO_LONG,
      ErrorCodes.CONFIG_ERROR,
      ErrorCodes.EXTRACTION_FAILED,
    ];
    for (const code of nonRetryableCodes) {
      expect(new ApiError("test", code).retryable).toBe(false);
    }
  });

  it("stores statusCode", () => {
    const err = new ApiError("not found", ErrorCodes.INVALID_MODEL, 404);
    expect(err.statusCode).toBe(404);
  });

  it("serializes to JSON", () => {
    const err = new ApiError("auth fail", ErrorCodes.AUTH_ERROR, 401);
    const json = err.toJSON();
    expect(json).toEqual({
      name: "ApiError",
      message: "auth fail",
      code: ErrorCodes.AUTH_ERROR,
      statusCode: 401,
      retryable: false,
    });
  });
});

// ──────────────────────────────────────────────
// classifyHttpError
// ──────────────────────────────────────────────
describe("classifyHttpError", () => {
  it("classifies 401 as AUTH_ERROR", () => {
    const err = classifyHttpError(401, "");
    expect(err.code).toBe(ErrorCodes.AUTH_ERROR);
    expect(err.statusCode).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it("classifies 403 as AUTH_ERROR", () => {
    const err = classifyHttpError(403, "");
    expect(err.code).toBe(ErrorCodes.AUTH_ERROR);
    expect(err.retryable).toBe(false);
  });

  it("classifies 429 as RATE_LIMIT", () => {
    const err = classifyHttpError(429, "");
    expect(err.code).toBe(ErrorCodes.RATE_LIMIT);
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it("classifies 500+ as SERVER_ERROR", () => {
    [500, 502, 503, 504].forEach((code) => {
      const err = classifyHttpError(code, "");
      expect(err.code).toBe(ErrorCodes.SERVER_ERROR);
      expect(err.statusCode).toBe(code);
      expect(err.retryable).toBe(true);
    });
  });

  it("classifies 400 as INVALID_REQUEST", () => {
    const err = classifyHttpError(400, '{"error":{"message":"bad request"}}');
    expect(err.code).toBe(ErrorCodes.INVALID_REQUEST);
    expect(err.retryable).toBe(false);
  });

  it("classifies 404 as INVALID_MODEL", () => {
    const err = classifyHttpError(404, "");
    expect(err.code).toBe(ErrorCodes.INVALID_MODEL);
    expect(err.statusCode).toBe(404);
    expect(err.retryable).toBe(false);
  });

  it("fallbacks to NETWORK_ERROR for unknown status", () => {
    const err = classifyHttpError(418, "I'm a teapot");
    expect(err.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(err.retryable).toBe(true);
  });

  it("extracts provider error message from JSON response", () => {
    const responseText = JSON.stringify({
      error: { message: "Insufficient quota" },
    });
    const err = classifyHttpError(429, responseText);
    expect(err.message).toContain("Insufficient quota");
  });

  it("extracts error from alternative JSON shapes", () => {
    // Some providers return { error: { code: "..." } }
    const responseText = JSON.stringify({
      error: { code: "rate_limit_exceeded" },
    });
    const err = classifyHttpError(429, responseText);
    expect(err.message).toContain("rate_limit_exceeded");
  });

  it("falls back to HTTP {status} when no provider message", () => {
    const err = classifyHttpError(503, "");
    expect(err.message).toContain("HTTP 503");
  });

  it("handles non-JSON response text gracefully", () => {
    const err = classifyHttpError(500, "<html>Server Error</html>");
    expect(err.message).toContain("HTTP 500");
  });
});

// ──────────────────────────────────────────────
// classifyNetworkError
// ──────────────────────────────────────────────
describe("classifyNetworkError", () => {
  it("classifies AbortError as NETWORK_ERROR", () => {
    const abortErr = new Error("The user aborted a request.");
    abortErr.name = "AbortError";
    const err = classifyNetworkError(abortErr);
    expect(err.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(err.message).toBe("Request aborted");
  });

  it("classifies TimeoutError", () => {
    const timeoutErr = new Error("timed out");
    timeoutErr.name = "TimeoutError";
    const err = classifyNetworkError(timeoutErr);
    expect(err.code).toBe(ErrorCodes.TIMEOUT);
    expect(err.message).toBe("Request timed out");
    expect(err.retryable).toBe(true);
  });

  it("classifies generic errors as NETWORK_ERROR", () => {
    const genericErr = new Error("Failed to fetch");
    const err = classifyNetworkError(genericErr);
    expect(err.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(err.message).toBe("Failed to fetch");
    expect(err.retryable).toBe(true);
  });

  it("handles errors without message", () => {
    const err = classifyNetworkError({});
    expect(err.message).toBe("Network error");
    expect(err.code).toBe(ErrorCodes.NETWORK_ERROR);
  });
});
