/**
 * Zep signs webhook deliveries via Svix (https://www.svix.com), which
 * uses HMAC-SHA256 over `"{svix-id}.{svix-timestamp}.{body}"`, keyed by
 * your endpoint's signing secret (base64-decoded, with the `whsec_`
 * prefix stripped). Webhook *endpoint management* (creating/listing
 * endpoints, rotating the signing secret) is done from the Zep
 * dashboard, not the API - {@link verifyWebhook} only covers verifying
 * deliveries your own server receives.
 *
 * Event types include "episode.processed", "ingest.batch.completed",
 * "byom.rate_limited", and "byom.request_failed" - see the Webhooks
 * guide for full payload shapes per event.
 *
 * Uses the Web Crypto API (`crypto.subtle`), available natively in
 * Node 19+, browsers, and edge runtimes - no `node:crypto` import, so
 * this module works unmodified outside of Node.
 */

/** The three Svix headers required to verify a webhook delivery. */
export interface WebhookHeaders {
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
}

export type WebhookVerificationFailureReason =
  "missing_headers" | "invalid_secret" | "signature_mismatch";

/** Thrown by {@link verifyWebhook} when a delivery cannot be verified. */
export class ZepWebhookVerificationError extends Error {
  readonly reason: WebhookVerificationFailureReason;

  constructor(reason: WebhookVerificationFailureReason, message: string) {
    super(message);
    this.name = "ZepWebhookVerificationError";
    this.reason = reason;
    Object.setPrototypeOf(this, ZepWebhookVerificationError.prototype);
  }
}

/**
 * Verifies a webhook delivery's svix-signature header against the
 * computed HMAC. `secret` is the endpoint's signing secret as shown in
 * the dashboard, including its `whsec_` prefix.
 *
 * `svixSignature` may contain multiple space-separated `v1,<base64>`
 * values (for secret rotation) - this matches against any of them.
 *
 * It is essential to verify against the raw request body exactly as
 * received - many web frameworks parse JSON before your handler runs,
 * which will break verification. Read the raw body first.
 *
 * @throws {ZepWebhookVerificationError} if verification fails.
 *
 * @example
 * ```ts
 * const rawBody = await request.text(); // read raw text, not request.json()
 * await verifyWebhook(rawBody, {
 *   svixId: request.headers.get("svix-id") ?? "",
 *   svixTimestamp: request.headers.get("svix-timestamp") ?? "",
 *   svixSignature: request.headers.get("svix-signature") ?? "",
 * }, signingSecret);
 * ```
 */
export async function verifyWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
): Promise<void> {
  if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature) {
    throw new ZepWebhookVerificationError("missing_headers", "Missing required webhook headers");
  }

  const key = await importHmacKey(secret);
  const signedContent = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
  const expected = await hmacSha256Base64(key, signedContent);

  const candidates = headers.svixSignature
    .split(/\s+/)
    .filter(Boolean)
    .map((candidate) => candidate.replace(/^v1,/, ""));

  const matched = candidates.some((candidate) => timingSafeEqual(candidate, expected));
  if (!matched) {
    throw new ZepWebhookVerificationError("signature_mismatch", "Webhook signature does not match");
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoded = secret.replace(/^whsec_/, "");
  let raw: Uint8Array;
  try {
    raw = base64ToBytes(encoded);
  } catch (cause) {
    throw new ZepWebhookVerificationError(
      "invalid_secret",
      `Webhook signing secret is not valid base64: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  return crypto.subtle.importKey("raw", raw.slice(), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

async function hmacSha256Base64(key: CryptoKey, content: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  return bytesToBase64(new Uint8Array(signature));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Constant-time string comparison to avoid timing side-channels. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
