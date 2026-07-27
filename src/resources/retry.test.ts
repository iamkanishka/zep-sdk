import { describe, expect, it } from "vitest";
import { startTestServer, writeJson } from "../test-support/server.js";
import { ZepClient } from "../client.js";

describe("retry behavior", () => {
  it("retries on 5xx and eventually succeeds", async () => {
    let attempts = 0;
    const { client, close } = await startTestServer((_req, res) => {
      attempts++;
      if (attempts < 3) {
        writeJson(res, 500, { message: "internal error" });
      } else {
        writeJson(res, 200, { thread_id: "t1" });
      }
    });

    try {
      const thread = await client.thread.create("t1", "u1");
      expect(thread.threadId).toBe("t1");
      expect(attempts).toBe(3);
    } finally {
      await close();
    }
  });

  it("retries on 429", async () => {
    let attempts = 0;
    const { client, close } = await startTestServer((_req, res) => {
      attempts++;
      if (attempts < 2) {
        writeJson(res, 429, { message: "rate limited" });
      } else {
        writeJson(res, 200, {});
      }
    });

    try {
      await client.thread.delete("t1");
      expect(attempts).toBe(2);
    } finally {
      await close();
    }
  });

  it("does not retry 4xx errors", async () => {
    let attempts = 0;
    const { client, close } = await startTestServer((_req, res) => {
      attempts++;
      writeJson(res, 400, { message: "bad request" });
    });

    try {
      await expect(client.thread.delete("t1")).rejects.toMatchObject({ status: 400 });
      expect(attempts).toBe(1);
    } finally {
      await close();
    }
  });

  it("gives up after maxRetries and surfaces the final error", async () => {
    let attempts = 0;
    const { baseUrl, close } = await startTestServer((_req, res) => {
      attempts++;
      writeJson(res, 500, { message: "still broken" });
    });

    try {
      const client = new ZepClient({ apiKey: "z_test", baseUrl, maxRetries: 2 });
      await expect(client.thread.delete("t1")).rejects.toMatchObject({ status: 500 });
      expect(attempts).toBe(3); // initial attempt + 2 retries
    } finally {
      await close();
    }
  });

  it("respects maxRetries: 0 (retries disabled)", async () => {
    let attempts = 0;
    const { baseUrl, close } = await startTestServer((_req, res) => {
      attempts++;
      writeJson(res, 500, {});
    });

    try {
      const client = new ZepClient({ apiKey: "z_test", baseUrl, maxRetries: 0 });
      await expect(client.thread.delete("t1")).rejects.toMatchObject({ status: 500 });
      expect(attempts).toBe(1);
    } finally {
      await close();
    }
  });

  it("respects an AbortSignal passed per-request-adjacent timeout config", async () => {
    const { baseUrl, close } = await startTestServer((_req, _res) => {
      // Never respond - forces the timeout to fire.
    });

    try {
      const client = new ZepClient({ apiKey: "z_test", baseUrl, timeoutMs: 50, maxRetries: 0 });
      await expect(client.thread.delete("t1")).rejects.toBeDefined();
    } finally {
      await close();
    }
  }, 10_000);
});
