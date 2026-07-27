/**
 * Classifies a {@link ZepError} by the HTTP status code that produced it.
 */
export type ErrorReason =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable_entity"
  | "rate_limited"
  | "internal_server_error"
  | "service_unavailable"
  | "unknown";

const REASONS_BY_STATUS: Readonly<Record<number, ErrorReason>> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "unprocessable_entity",
  429: "rate_limited",
  500: "internal_server_error",
  502: "service_unavailable",
  503: "service_unavailable",
  504: "service_unavailable",
};

const RETRIABLE_REASONS: ReadonlySet<ErrorReason> = new Set<ErrorReason>([
  "rate_limited",
  "internal_server_error",
  "service_unavailable",
]);

/**
 * Represents a non-2xx response from the Zep API.
 *
 * Every rejected promise from a resource method rejects with either a
 * {@link ZepError} (the API responded, but with a non-2xx status) or the
 * underlying error thrown by `fetch` itself (network failure, abort,
 * etc) - distinguish them with {@link isZepError}.
 *
 * @example
 * ```ts
 * try {
 *   await client.thread.getSummary("thread-1");
 * } catch (err) {
 *   if (isZepError(err) && err.reason === "not_found") {
 *     // no summary yet
 *   } else if (isZepError(err) && err.reason === "forbidden") {
 *     // plan upgrade required
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 */
export class ZepError extends Error {
  /** Coarse classification of the failure, derived from `status`. */
  readonly reason: ErrorReason;
  /** The HTTP status code returned by the API. */
  readonly status: number;
  /** The decoded response body, if any (shape varies by endpoint). */
  readonly body: unknown;
  /** The `x-request-id` response header, if present - useful when contacting Zep support. */
  readonly requestId: string | undefined;

  constructor(options: { status: number; body: unknown; requestId: string | undefined }) {
    const reason = REASONS_BY_STATUS[options.status] ?? "unknown";
    super(messageForReason(reason, options.status, options.body));
    this.name = "ZepError";
    this.reason = reason;
    this.status = options.status;
    this.body = options.body;
    this.requestId = options.requestId;

    // Restore the prototype chain (needed when targeting ES2022 output
    // consumed under some transpilation/bundling setups).
    Object.setPrototypeOf(this, ZepError.prototype);
  }

  /** Whether this error is generally safe to retry (429 and 5xx). */
  get retriable(): boolean {
    return RETRIABLE_REASONS.has(this.reason);
  }
}

function messageForReason(reason: ErrorReason, status: number, body: unknown): string {
  const extracted = extractMessage(body);
  if (extracted) return extracted;

  switch (reason) {
    case "bad_request":
      return "Bad request";
    case "unauthorized":
      return "Unauthorized: check your Zep API key";
    case "forbidden":
      return "Forbidden - this feature may require a plan upgrade";
    case "not_found":
      return "Resource not found";
    case "conflict":
      return "Conflict";
    case "unprocessable_entity":
      return "Unprocessable entity";
    case "rate_limited":
      return "Rate limited by the Zep API";
    case "internal_server_error":
      return "Zep API internal server error";
    case "service_unavailable":
      return "Zep API is temporarily unavailable";
    case "unknown":
      return `Unexpected HTTP ${status}`;
  }
}

function extractMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record["message"] === "string") return record["message"];
  if (typeof record["error"] === "string") return record["error"];
  return undefined;
}

/**
 * Type guard narrowing an unknown caught value to a {@link ZepError}.
 *
 * @example
 * ```ts
 * catch (err) {
 *   if (isZepError(err)) console.log(err.reason, err.status);
 * }
 * ```
 */
export function isZepError(err: unknown): err is ZepError {
  return err instanceof ZepError;
}

/** Convenience predicate: `isZepError(err) && err.reason === "not_found"`. */
export function isNotFound(err: unknown): boolean {
  return isZepError(err) && err.reason === "not_found";
}

/** Convenience predicate: `isZepError(err) && err.reason === "forbidden"`. */
export function isForbidden(err: unknown): boolean {
  return isZepError(err) && err.reason === "forbidden";
}

/** Convenience predicate: `isZepError(err) && err.reason === "unauthorized"`. */
export function isUnauthorized(err: unknown): boolean {
  return isZepError(err) && err.reason === "unauthorized";
}

/** Convenience predicate: `isZepError(err) && err.reason === "rate_limited"`. */
export function isRateLimited(err: unknown): boolean {
  return isZepError(err) && err.reason === "rate_limited";
}

/** Convenience predicate: `isZepError(err) && err.reason === "conflict"`. */
export function isConflict(err: unknown): boolean {
  return isZepError(err) && err.reason === "conflict";
}

/** Thrown synchronously (not a rejected promise) for invalid call-time arguments. */
export class ZepInvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZepInvalidArgumentError";
    Object.setPrototypeOf(this, ZepInvalidArgumentError.prototype);
  }
}

/** Thrown by `await`-style polling helpers when the deadline elapses first. */
export class ZepTimeoutError extends Error {
  constructor(message = "Timed out waiting for terminal status") {
    super(message);
    this.name = "ZepTimeoutError";
    Object.setPrototypeOf(this, ZepTimeoutError.prototype);
  }
}
