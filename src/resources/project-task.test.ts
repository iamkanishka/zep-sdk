import { describe, expect, it } from "vitest";
import { startTestServer, readJsonBody, writeJson, pathname } from "../test-support/server.js";
import { ZepTimeoutError } from "../errors.js";
import { ZepClient } from "../client.js";

describe("ProjectResource", () => {
  it("get() returns current project settings", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/projects/current");
      writeJson(res, 200, { project_uuid: "p1", name: "Voidspace" });
    });
    try {
      const project = await client.project.get();
      expect(project.name).toBe("Voidspace");
    } finally {
      await close();
    }
  });

  it("update() patches project settings", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(req.method).toBe("PATCH");
      expect(await readJsonBody(req)).toEqual({ name: "New Name" });
      writeJson(res, 200, { project_uuid: "p1", name: "New Name" });
    });
    try {
      const project = await client.project.update({ name: "New Name" });
      expect(project.name).toBe("New Name");
    } finally {
      await close();
    }
  });
});

describe("TaskResource", () => {
  it("get() fetches task status", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/tasks/task1");
      writeJson(res, 200, { task_id: "task1", status: "processing" });
    });
    try {
      const task = await client.task.get("task1");
      expect(task.status).toBe("processing");
    } finally {
      await close();
    }
  });

  it("await() polls until completed", async () => {
    let calls = 0;
    const { client, close } = await startTestServer((_req, res) => {
      calls++;
      const status = calls >= 3 ? "completed" : "processing";
      writeJson(res, 200, { task_id: "task1", status });
    });
    try {
      const task = await client.task.await("task1", { pollIntervalMs: 1, timeoutMs: 5000 });
      expect(task.status).toBe("completed");
      expect(calls).toBe(3);
    } finally {
      await close();
    }
  });

  it("await() treats failed as terminal", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { task_id: "task1", status: "failed" });
    });
    try {
      const task = await client.task.await("task1", { pollIntervalMs: 1, timeoutMs: 5000 });
      expect(task.status).toBe("failed");
    } finally {
      await close();
    }
  });

  it("await() throws ZepTimeoutError on deadline", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { task_id: "task1", status: "processing" });
    });
    try {
      await expect(
        client.task.await("task1", { pollIntervalMs: 5, timeoutMs: 20 }),
      ).rejects.toBeInstanceOf(ZepTimeoutError);
    } finally {
      await close();
    }
  });

  it("await() rejects promptly when the abort signal fires", async () => {
    const { baseUrl, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { task_id: "task1", status: "processing" });
    });
    try {
      const client = new ZepClient({ apiKey: "z_test", baseUrl });
      const controller = new AbortController();
      controller.abort();
      await expect(
        client.task.await("task1", {
          pollIntervalMs: 10_000,
          timeoutMs: 60_000,
          signal: controller.signal,
        }),
      ).rejects.toBeDefined();
    } finally {
      await close();
    }
  });
});
