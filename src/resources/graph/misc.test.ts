import { describe, expect, it } from "vitest";
import {
  startTestServer,
  readJsonBody,
  writeJson,
  query,
  pathname,
} from "../../test-support/server.js";
import { userScope, graphIdScope } from "./shared.js";
import { ZepInvalidArgumentError } from "../../errors.js";

describe("GraphCustomInstructionsResource", () => {
  it("set() puts instructions scoped to a user", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(req.method).toBe("PUT");
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body["instructions"]).toBe("always extract monetary amounts");
      expect(body["user_id"]).toBe("u1");
      writeJson(res, 200, {});
    });
    try {
      await client.graph.customInstructions.set("always extract monetary amounts", userScope("u1"));
    } finally {
      await close();
    }
  });

  it("set() requires a valid scope", async () => {
    const { client, close } = await startTestServer((_req, _res) => {
      throw new Error("should not make a request");
    });
    try {
      await expect(client.graph.customInstructions.set("x", {} as never)).rejects.toBeInstanceOf(
        ZepInvalidArgumentError,
      );
    } finally {
      await close();
    }
  });

  it("get() returns the current instructions", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(query(req)["graph_id"]).toBe("g1");
      writeJson(res, 200, { instructions: "some instructions" });
    });
    try {
      const result = await client.graph.customInstructions.get(graphIdScope("g1"));
      expect(result.instructions).toBe("some instructions");
    } finally {
      await close();
    }
  });
});

describe("GraphObservationsResource", () => {
  it("add() posts a new observation", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body["content"]).toBe("user prefers dark mode");
      writeJson(res, 200, { uuid: "obs1", content: "user prefers dark mode" });
    });
    try {
      const obs = await client.graph.observations.add("user prefers dark mode", {
        scope: userScope("u1"),
      });
      expect(obs.uuid).toBe("obs1");
    } finally {
      await close();
    }
  });

  it("list() returns observations", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { observations: [{ uuid: "obs1" }] });
    });
    try {
      const observations = await client.graph.observations.list({ scope: userScope("u1") });
      expect(observations).toHaveLength(1);
    } finally {
      await close();
    }
  });
});

describe("GraphThreadSummariesResource", () => {
  it("list() returns folded-in thread summaries", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/graph/thread-summaries");
      writeJson(res, 200, {
        summaries: [{ thread_id: "t1", summary: "a conversation about math" }],
      });
    });
    try {
      const summaries = await client.graph.threadSummaries.list({ scope: userScope("u1") });
      expect(summaries[0]?.summary).toBe("a conversation about math");
    } finally {
      await close();
    }
  });
});
