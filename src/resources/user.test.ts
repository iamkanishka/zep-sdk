import { describe, expect, it } from "vitest";
import {
  startTestServer,
  readJsonBody,
  writeJson,
  query,
  pathname,
} from "../test-support/server.js";

describe("UserResource", () => {
  it("add() posts user fields, omitting undefined", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body["user_id"]).toBe("u1");
      expect(body["first_name"]).toBe("Ada");
      expect(body["last_name"]).toBeUndefined();
      writeJson(res, 200, { user_id: "u1", first_name: "Ada" });
    });

    try {
      const user = await client.user.add("u1", { firstName: "Ada" });
      expect(user.firstName).toBe("Ada");
    } finally {
      await close();
    }
  });

  it("get() fetches a single user", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/users/u1");
      writeJson(res, 200, { user_id: "u1", email: "ada@example.com" });
    });

    try {
      const user = await client.user.get("u1");
      expect(user.email).toBe("ada@example.com");
    } finally {
      await close();
    }
  });

  it("update() patches a user", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(req.method).toBe("PATCH");
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body["email"]).toBe("new@example.com");
      writeJson(res, 200, { user_id: "u1", email: "new@example.com" });
    });

    try {
      const user = await client.user.update("u1", { email: "new@example.com" });
      expect(user.email).toBe("new@example.com");
    } finally {
      await close();
    }
  });

  it("delete() issues a DELETE", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(req.method).toBe("DELETE");
      writeJson(res, 200, {});
    });

    try {
      await client.user.delete("u1");
    } finally {
      await close();
    }
  });

  it("getThreads() returns a plain (non-paginated) list", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/users/u1/threads");
      writeJson(res, 200, [{ thread_id: "t1" }, { thread_id: "t2" }]);
    });

    try {
      const threads = await client.user.getThreads("u1");
      expect(threads).toHaveLength(2);
      expect(threads[0]?.threadId).toBe("t1");
    } finally {
      await close();
    }
  });

  it("listOrdered() parses a paginated user list", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { users: [{ user_id: "u1" }], total_count: 1 });
    });

    try {
      const result = await client.user.listOrdered();
      expect(result.users).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    } finally {
      await close();
    }
  });

  it("listAll() walks every page", async () => {
    const { client, close } = await startTestServer((req, res) => {
      const page = query(req)["page_number"];
      if (page === "1") {
        writeJson(res, 200, { users: [{ user_id: "u1" }, { user_id: "u2" }], total_count: 3 });
      } else {
        writeJson(res, 200, { users: [{ user_id: "u3" }], total_count: 3 });
      }
    });

    try {
      const ids: string[] = [];
      for await (const user of client.user.listAll({ pageSize: 2 })) {
        ids.push(user.userId);
      }
      expect(ids).toEqual(["u1", "u2", "u3"]);
    } finally {
      await close();
    }
  });

  it("addInstructions() scopes to userIds when given", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body["instructions"]).toEqual([{ text: "always note favorite color" }]);
      expect(body["user_ids"]).toEqual(["u1"]);
      writeJson(res, 200, {});
    });

    try {
      await client.user.addInstructions([{ text: "always note favorite color" }], {
        userIds: ["u1"],
      });
    } finally {
      await close();
    }
  });
});
