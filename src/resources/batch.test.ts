import { describe, expect, it } from "vitest";
import {
  startTestServer,
  readJsonBody,
  writeJson,
  query,
  pathname,
} from "../test-support/server.js";
import { ZepInvalidArgumentError, ZepTimeoutError } from "../errors.js";

describe("BatchResource", () => {
  it("create() creates an empty draft batch with optional metadata", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(await readJsonBody(req)).toEqual({ metadata: { description: "backfill" } });
      writeJson(res, 200, { batch_id: "b1", status: "draft" });
    });

    try {
      const job = await client.batch.create({ metadata: { description: "backfill" } });
      expect(job.status).toBe("draft");
    } finally {
      await close();
    }
  });

  it("add() rejects more than 500 items", async () => {
    const { client, close } = await startTestServer((_req, _res) => {
      throw new Error("should not make a request");
    });

    try {
      const items = Array.from({ length: 501 }, () => ({
        type: "graph_episode" as const,
        userId: "u1",
        data: "x",
      }));
      await expect(client.batch.add("b1", items)).rejects.toBeInstanceOf(ZepInvalidArgumentError);
    } finally {
      await close();
    }
  });

  it("add() posts items to the correct path", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(pathname(req)).toBe("/api/v2/batch/b1/items");
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body["items"]).toEqual([
        {
          type: "graph_episode",
          user_id: "alice",
          data: "Alice upgraded to Pro.",
          data_type: "text",
        },
        {
          type: "thread_message",
          thread_id: "alice-support-42",
          content: "Dashboard won't load.",
          role: "user",
          name: "Alice",
        },
      ]);
      writeJson(res, 200, {});
    });

    try {
      await client.batch.add("b1", [
        {
          type: "graph_episode",
          userId: "alice",
          data: "Alice upgraded to Pro.",
          dataType: "text",
        },
        {
          type: "thread_message",
          threadId: "alice-support-42",
          content: "Dashboard won't load.",
          role: "user",
          name: "Alice",
        },
      ]);
    } finally {
      await close();
    }
  });

  it("process() posts to the process endpoint", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/batch/b1/process");
      expect(req.method).toBe("POST");
      writeJson(res, 200, {});
    });

    try {
      await client.batch.process("b1");
    } finally {
      await close();
    }
  });

  it("get() parses status and nested progress", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, {
        batch_id: "b1",
        status: "processing",
        progress: { total_items: 10, succeeded_items: 4, percent_complete: 40 },
      });
    });

    try {
      const job = await client.batch.get("b1");
      expect(job.progress.totalItems).toBe(10);
      expect(job.progress.percentComplete).toBe(40);
    } finally {
      await close();
    }
  });

  it("listItems() returns per-item statuses", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, {
        items: [{ item_id: "i1", status: "failed", error: "bad data" }],
      });
    });

    try {
      const items = await client.batch.listItems("b1");
      expect(items[0]).toMatchObject({ itemId: "i1", status: "failed", error: "bad data" });
    } finally {
      await close();
    }
  });

  it("await() polls until a terminal status is reached", async () => {
    let calls = 0;
    const { client, close } = await startTestServer((_req, res) => {
      calls++;
      const status = calls < 2 ? "processing" : "succeeded";
      writeJson(res, 200, { batch_id: "b1", status });
    });

    try {
      const job = await client.batch.await("b1", { pollIntervalMs: 1, timeoutMs: 5000 });
      expect(job.status).toBe("succeeded");
    } finally {
      await close();
    }
  });

  it.each(["partial", "failed", "invalid"])("await() treats %s as terminal", async (status) => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { batch_id: "b1", status });
    });

    try {
      const job = await client.batch.await("b1", { pollIntervalMs: 1, timeoutMs: 5000 });
      expect(job.status).toBe(status);
    } finally {
      await close();
    }
  });

  it("await() throws ZepTimeoutError if the deadline elapses first", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { batch_id: "b1", status: "processing" });
    });

    try {
      await expect(
        client.batch.await("b1", { pollIntervalMs: 5, timeoutMs: 20 }),
      ).rejects.toBeInstanceOf(ZepTimeoutError);
    } finally {
      await close();
    }
  });

  it("list() filters by status", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(query(req)).toEqual({ status: "succeeded" });
      writeJson(res, 200, { batches: [] });
    });

    try {
      const batches = await client.batch.list({ status: "succeeded" });
      expect(batches).toEqual([]);
    } finally {
      await close();
    }
  });

  it("delete() issues a DELETE to the batch path", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/batch/b1");
      expect(req.method).toBe("DELETE");
      writeJson(res, 200, {});
    });

    try {
      await client.batch.delete("b1");
    } finally {
      await close();
    }
  });
});
