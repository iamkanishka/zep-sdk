import { describe, expect, it } from "vitest";
import {
  ZepError,
  isZepError,
  isNotFound,
  isForbidden,
  isUnauthorized,
  isRateLimited,
  isConflict,
} from "./errors.js";

describe("ZepError", () => {
  it("classifies known status codes", () => {
    const cases: [number, string][] = [
      [400, "bad_request"],
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
      [409, "conflict"],
      [422, "unprocessable_entity"],
      [429, "rate_limited"],
      [500, "internal_server_error"],
      [502, "service_unavailable"],
      [503, "service_unavailable"],
      [504, "service_unavailable"],
    ];

    for (const [status, reason] of cases) {
      const err = new ZepError({ status, body: undefined, requestId: undefined });
      expect(err.reason).toBe(reason);
    }
  });

  it("classifies unknown status codes as unknown", () => {
    const err = new ZepError({ status: 418, body: undefined, requestId: undefined });
    expect(err.reason).toBe("unknown");
  });

  it("extracts a message from the response body when present", () => {
    const err1 = new ZepError({
      status: 400,
      body: { message: "bad thread_id" },
      requestId: undefined,
    });
    expect(err1.message).toBe("bad thread_id");

    const err2 = new ZepError({
      status: 404,
      body: { error: "not found here" },
      requestId: undefined,
    });
    expect(err2.message).toBe("not found here");
  });

  it("falls back to a sensible default message", () => {
    const err = new ZepError({ status: 500, body: undefined, requestId: undefined });
    expect(err.message).toBe("Zep API internal server error");
  });

  it("carries the request id", () => {
    const err = new ZepError({ status: 500, body: undefined, requestId: "req_123" });
    expect(err.requestId).toBe("req_123");
  });

  it("marks 429 and 5xx as retriable", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      const err = new ZepError({ status, body: undefined, requestId: undefined });
      expect(err.retriable).toBe(true);
    }
  });

  it("marks 4xx (other than 429) as not retriable", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      const err = new ZepError({ status, body: undefined, requestId: undefined });
      expect(err.retriable).toBe(false);
    }
  });

  it("is a real instanceof Error", () => {
    const err = new ZepError({ status: 404, body: undefined, requestId: undefined });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ZepError");
  });
});

describe("type guards", () => {
  it("isZepError narrows correctly", () => {
    expect(isZepError(new ZepError({ status: 404, body: undefined, requestId: undefined }))).toBe(
      true,
    );
    expect(isZepError(new Error("plain"))).toBe(false);
    expect(isZepError("not an error")).toBe(false);
  });

  it("reason-specific predicates match only their own reason", () => {
    const notFound = new ZepError({ status: 404, body: undefined, requestId: undefined });
    expect(isNotFound(notFound)).toBe(true);
    expect(isForbidden(notFound)).toBe(false);

    const forbidden = new ZepError({ status: 403, body: undefined, requestId: undefined });
    expect(isForbidden(forbidden)).toBe(true);

    const unauthorized = new ZepError({ status: 401, body: undefined, requestId: undefined });
    expect(isUnauthorized(unauthorized)).toBe(true);

    const rateLimited = new ZepError({ status: 429, body: undefined, requestId: undefined });
    expect(isRateLimited(rateLimited)).toBe(true);

    const conflict = new ZepError({ status: 409, body: undefined, requestId: undefined });
    expect(isConflict(conflict)).toBe(true);
  });

  it("predicates are false for non-ZepError values", () => {
    expect(isNotFound(new Error("plain"))).toBe(false);
    expect(isForbidden(undefined)).toBe(false);
  });
});
