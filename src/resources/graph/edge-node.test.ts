import { describe, expect, it } from "vitest";
import {
  startTestServer,
  readJsonBody,
  writeJson,
  pathname,
  query,
} from "../../test-support/server.js";
import { userScope } from "./shared.js";

describe("GraphEdgeResource", () => {
  it("get() fetches a single edge", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/graph/edge/e1");
      writeJson(res, 200, { uuid: "e1", fact: "Ada loves math" });
    });
    try {
      const edge = await client.graph.edge.get("e1");
      expect(edge.fact).toBe("Ada loves math");
    } finally {
      await close();
    }
  });

  it("getByUserOrGraph() lists edges scoped to a user", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(query(req)["user_id"]).toBe("u1");
      writeJson(res, 200, { edges: [{ uuid: "e1" }] });
    });
    try {
      const edges = await client.graph.edge.getByUserOrGraph({ scope: userScope("u1") });
      expect(edges).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("update() patches fact and rating", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(await readJsonBody(req)).toEqual({ fact: "updated fact", rating: undefined });
      writeJson(res, 200, { uuid: "e1", fact: "updated fact" });
    });
    try {
      const edge = await client.graph.edge.update("e1", { fact: "updated fact" });
      expect(edge.fact).toBe("updated fact");
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
      await client.graph.edge.delete("e1");
    } finally {
      await close();
    }
  });
});

describe("GraphNodeResource", () => {
  it("get() fetches a single node", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { uuid: "n1", name: "Ada" });
    });
    try {
      const node = await client.graph.node.get("n1");
      expect(node.name).toBe("Ada");
    } finally {
      await close();
    }
  });

  it("getByUserOrGraph() lists nodes", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { nodes: [{ uuid: "n1" }, { uuid: "n2" }] });
    });
    try {
      const nodes = await client.graph.node.getByUserOrGraph({ scope: userScope("u1") });
      expect(nodes).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("getEdges() returns edges connected to a node", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/graph/node/n1/edges");
      writeJson(res, 200, { edges: [{ uuid: "e1" }] });
    });
    try {
      const edges = await client.graph.node.getEdges("n1");
      expect(edges).toHaveLength(1);
    } finally {
      await close();
    }
  });
});
