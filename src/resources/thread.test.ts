import { describe, expect, it } from "vitest";
import {
  startTestServer,
  readJsonBody,
  writeJson,
  query,
  pathname,
} from "../test-support/server.js";

describe("ThreadResource", () => {
  it("list() parses a paginated thread list and query params", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/threads");
      expect(req.method).toBe("GET");
      expect(query(req)).toEqual({
        page_number: "1",
        page_size: "10",
        order_by: "created_at",
        asc: "true",
      });
      writeJson(res, 200, {
        threads: [{ thread_id: "t1", user_id: "u1", uuid: "uuid-1" }],
        response_count: 1,
        total_count: 1,
      });
    });

    try {
      const result = await client.thread.list({
        pageNumber: 1,
        pageSize: 10,
        orderBy: "created_at",
        asc: true,
      });
      expect(result.threads).toHaveLength(1);
      expect(result.threads[0]?.threadId).toBe("t1");
      expect(result.threads[0]?.userId).toBe("u1");
    } finally {
      await close();
    }
  });

  it("list() omits undefined query params", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(query(req)).toEqual({});
      writeJson(res, 200, { threads: [] });
    });

    try {
      const result = await client.thread.list();
      expect(result.threads).toEqual([]);
    } finally {
      await close();
    }
  });

  it("create() posts thread_id and user_id", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(pathname(req)).toBe("/api/v2/threads");
      expect(req.method).toBe("POST");
      expect(await readJsonBody(req)).toEqual({ thread_id: "t1", user_id: "u1" });
      writeJson(res, 200, { thread_id: "t1", user_id: "u1" });
    });

    try {
      const thread = await client.thread.create("t1", "u1");
      expect(thread.threadId).toBe("t1");
    } finally {
      await close();
    }
  });

  it("delete() maps a 404 to a ZepError with reason not_found", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 404, { message: "thread not found" });
    });

    try {
      await expect(client.thread.delete("missing")).rejects.toMatchObject({
        name: "ZepError",
        reason: "not_found",
        message: "thread not found",
      });
    } finally {
      await close();
    }
  });

  it("addMessages() serializes messages and options", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(pathname(req)).toBe("/api/v2/threads/t1/messages");
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body["messages"]).toEqual([{ role: "user", content: "hi" }]);
      expect(body["ignore_roles"]).toEqual(["assistant"]);
      writeJson(res, 200, {});
    });

    try {
      await client.thread.addMessages("t1", [{ role: "user", content: "hi" }], {
        ignoreRoles: ["assistant"],
      });
    } finally {
      await close();
    }
  });

  it("getSummary() rejects with not_found before any summary exists", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 404, { message: "no summary yet" });
    });

    try {
      await expect(client.thread.getSummary("t1")).rejects.toMatchObject({ reason: "not_found" });
    } finally {
      await close();
    }
  });

  it("listAll() walks every page", async () => {
    const { client, close } = await startTestServer((req, res) => {
      const page = query(req)["page_number"];
      if (page === "1") {
        writeJson(res, 200, {
          threads: [{ thread_id: "t1" }, { thread_id: "t2" }],
          total_count: 3,
        });
      } else if (page === "2") {
        writeJson(res, 200, { threads: [{ thread_id: "t3" }], total_count: 3 });
      } else {
        throw new Error(`unexpected page: ${page ?? "undefined"}`);
      }
    });

    try {
      const ids: string[] = [];
      for await (const thread of client.thread.listAll({ pageSize: 2 })) {
        ids.push(thread.threadId);
      }
      expect(ids).toEqual(["t1", "t2", "t3"]);
    } finally {
      await close();
    }
  });

  it("updateMessage() patches an individual message", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(pathname(req)).toBe("/api/v2/messages/msg-1");
      expect(req.method).toBe("PATCH");
      expect(await readJsonBody(req)).toMatchObject({ content: "edited" });
      writeJson(res, 200, { uuid: "msg-1", content: "edited", role: "user" });
    });

    try {
      const msg = await client.thread.updateMessage("msg-1", { content: "edited" });
      expect(msg.content).toBe("edited");
    } finally {
      await close();
    }
  });

  it("getUserContext() returns the assembled context block", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/threads/t1/context");
      expect(query(req)).toEqual({ template_id: "tpl1" });
      writeJson(res, 200, { context: "some assembled context" });
    });

    try {
      const result = await client.thread.getUserContext("t1", { templateId: "tpl1" });
      expect(result.context).toBe("some assembled context");
    } finally {
      await close();
    }
  });

  it("getMessages() passes limit/lastN through", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(query(req)).toEqual({ limit: "10", lastn: "5" });
      writeJson(res, 200, {
        messages: [{ role: "user", content: "hi" }],
        row_count: 1,
        user_id: "u1",
      });
    });

    try {
      const result = await client.thread.getMessages("t1", { limit: 10, lastN: 5 });
      expect(result.messages).toHaveLength(1);
      expect(result.userId).toBe("u1");
    } finally {
      await close();
    }
  });

  it("addMessagesBatch() posts to the deprecated batch endpoint", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/threads/t1/messages-batch");
      writeJson(res, 200, {});
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentionally testing back-compat behavior
      await client.thread.addMessagesBatch("t1", [{ role: "user", content: "hi" }]);
    } finally {
      await close();
    }
  });
});
