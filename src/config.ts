export const DEFAULT_BASE_URL = "https://api.getzep.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

/** Options accepted by {@link ZepClient}'s constructor. */
export interface ZepClientOptions {
  /**
   * Zep project API key. If omitted, falls back to the `ZEP_API_KEY`
   * environment variable (Node only - browsers/edge runtimes must pass
   * this explicitly, since `process.env` isn't available there).
   */
  apiKey?: string;
  /** API base URL. Defaults to {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 30_000. */
  timeoutMs?: number;
  /**
   * Retry attempts for retriable errors (429 and 5xx), with exponential
   * backoff. Defaults to 2. Pass 0 to disable retries entirely.
   */
  maxRetries?: number;
  /** Overrides the User-Agent header sent with every request. */
  userAgent?: string;
  /**
   * Custom fetch implementation - useful for testing or for environments
   * needing a polyfill. Defaults to `globalThis.fetch`.
   */
  fetch?: typeof fetch;
}

/** Resolved, fully-defaulted client configuration. */
export interface ResolvedZepConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  userAgent: string;
  fetch: typeof fetch;
}

/**
 * Resolves {@link ZepClientOptions} into a {@link ResolvedZepConfig},
 * falling back to the `ZEP_API_KEY` environment variable (when
 * `process.env` is available) for the API key.
 *
 * @throws {ZepConfigError} if no API key can be resolved.
 */
export function resolveConfig(options: ZepClientOptions, version: string): ResolvedZepConfig {
  const apiKey = options.apiKey ?? readEnvApiKey();
  if (!apiKey) {
    throw new ZepConfigError(
      "No Zep API key configured. Pass { apiKey } to new ZepClient(...), or set the " +
        "ZEP_API_KEY environment variable (Node only).",
    );
  }

  return {
    apiKey,
    baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    userAgent: options.userAgent ?? `zep-sdk/${version}`,
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
  };
}

function readEnvApiKey(): string | undefined {
  // `process` doesn't exist in browsers/edge runtimes - guard defensively
  // rather than assuming a Node environment.
  if (typeof process === "undefined" || typeof process.env === "undefined") {
    return undefined;
  }
  return process.env["ZEP_API_KEY"];
}

/** Raised when a {@link ZepClient} cannot be constructed due to missing configuration. */
export class ZepConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZepConfigError";
    Object.setPrototypeOf(this, ZepConfigError.prototype);
  }
}
