import type { ResolvedZepConfig } from "./config.js";
import { ZepError } from "./errors.js";
import { sleep } from "./internal/sleep.js";

export interface RequestParams {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Caller-supplied cancellation, merged with the per-request timeout. */
  signal?: AbortSignal;
}

/** Performs a single request/response cycle, retrying retriable errors with backoff. */
export async function request(config: ResolvedZepConfig, params: RequestParams): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      await sleepBackoff(attempt - 1, params.signal);
    }

    try {
      return await requestOnce(config, params);
    } catch (err) {
      lastError = err;
      if (!isRetriable(err)) throw err;
    }
  }

  throw lastError;
}

async function requestOnce(config: ResolvedZepConfig, params: RequestParams): Promise<unknown> {
  const url = buildUrl(config.baseUrl, params.path, params.query);

  const headers: Record<string, string> = {
    Authorization: `Api-Key ${config.apiKey}`,
    "User-Agent": config.userAgent,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (params.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(params.body);
  }

  const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
  const signal = params.signal ? mergeSignals(params.signal, timeoutSignal) : timeoutSignal;

  const response = await config.fetch(url, {
    method: params.method,
    headers,
    body,
    signal,
  });

  const responseBody = await decodeBody(response);

  if (!response.ok) {
    throw new ZepError({
      status: response.status,
      body: responseBody,
      requestId: response.headers.get("x-request-id") ?? undefined,
    });
  }

  return responseBody;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | boolean | undefined> | undefined,
): string {
  const url = new URL(baseUrl + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function decodeBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Error bodies aren't guaranteed to be JSON - fall back to raw text.
    return text;
  }
}

function isRetriable(err: unknown): boolean {
  if (err instanceof ZepError) return err.retriable;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof Error && err.name === "TimeoutError") return false;
  // Any other error at this point is a transport-level failure (DNS,
  // connection refused, etc) - safe to retry.
  return true;
}

/** Exponential backoff with jitter: ~200ms, ~400ms, ~800ms, ... */
async function sleepBackoff(attempt: number, signal: AbortSignal | undefined): Promise<void> {
  const base = 2 ** attempt * 200;
  const jitter = Math.floor(Math.random() * 100);
  await sleep(base + jitter, signal);
}

/** Combines two AbortSignals via the standard AbortSignal.any. */
function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  return AbortSignal.any([a, b]);
}
