import { describe, expect, it } from "vitest";
import { verifyWebhook, ZepWebhookVerificationError } from "./webhook.js";

const SECRET_KEY_BYTES = "this-is-a-test-signing-secret-!";

function testSecret(): string {
  return "whsec_" + Buffer.from(SECRET_KEY_BYTES).toString("base64");
}

async function sign(
  svixId: string,
  svixTimestamp: string,
  body: string,
  secret: string,
): Promise<string> {
  const encoded = secret.replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(encoded, "base64"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${svixId}.${svixTimestamp}.${body}`),
  );
  return "v1," + Buffer.from(signature).toString("base64");
}

describe("verifyWebhook", () => {
  it("resolves for a correctly signed payload", async () => {
    const secret = testSecret();
    const body = JSON.stringify({ type: "episode.processed" });
    const svixId = "msg_1";
    const svixTimestamp = "1700000000";
    const svixSignature = await sign(svixId, svixTimestamp, body, secret);

    await expect(
      verifyWebhook(body, { svixId, svixTimestamp, svixSignature }, secret),
    ).resolves.toBeUndefined();
  });

  it("accepts any matching signature among space-separated candidates (rotation)", async () => {
    const secret = testSecret();
    const body = JSON.stringify({ type: "ingest.batch.completed" });
    const svixId = "msg_2";
    const svixTimestamp = "1700000001";
    const real = await sign(svixId, svixTimestamp, body, secret);
    const fake = "v1,bm90YXJlYWxzaWduYXR1cmU=";

    await expect(
      verifyWebhook(body, { svixId, svixTimestamp, svixSignature: `${fake} ${real}` }, secret),
    ).resolves.toBeUndefined();
  });

  it("rejects a tampered body", async () => {
    const secret = testSecret();
    const svixId = "msg_3";
    const svixTimestamp = "1700000002";
    const svixSignature = await sign(
      svixId,
      svixTimestamp,
      JSON.stringify({ type: "episode.processed" }),
      secret,
    );

    const promise = verifyWebhook(
      JSON.stringify({ type: "tampered" }),
      { svixId, svixTimestamp, svixSignature },
      secret,
    );
    await expect(promise).rejects.toBeInstanceOf(ZepWebhookVerificationError);
    await expect(promise).rejects.toMatchObject({ reason: "signature_mismatch" });
  });

  it("rejects a signature made with the wrong secret", async () => {
    const secret = testSecret();
    const wrongSecret =
      "whsec_" + Buffer.from("a-completely-different-secret!!").toString("base64");
    const body = JSON.stringify({ type: "episode.processed" });
    const svixId = "msg_4";
    const svixTimestamp = "1700000003";
    const svixSignature = await sign(svixId, svixTimestamp, body, wrongSecret);

    await expect(
      verifyWebhook(body, { svixId, svixTimestamp, svixSignature }, secret),
    ).rejects.toMatchObject({ reason: "signature_mismatch" });
  });

  it("rejects when required headers are missing", async () => {
    await expect(
      verifyWebhook("{}", { svixId: "msg_5", svixTimestamp: "", svixSignature: "" }, testSecret()),
    ).rejects.toMatchObject({ reason: "missing_headers" });
  });

  it("rejects a malformed (non-base64) secret", async () => {
    await expect(
      verifyWebhook(
        "{}",
        { svixId: "msg_6", svixTimestamp: "1700000004", svixSignature: "v1,anything" },
        "whsec_not valid base64!!",
      ),
    ).rejects.toMatchObject({ reason: "invalid_secret" });
  });
});
