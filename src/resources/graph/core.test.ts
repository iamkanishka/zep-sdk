import { describe, expect, it } from "vitest";
import {
  startTestServer,
  readJsonBody,
  writeJson,
  pathname,
  query,
} from "../../test-support/server.js";
import { userScope, graphIdScope, validateScope } from "./shared.js";
import { ZepInvalidArgumentError } from "../../errors.js";

describe("GraphScope validation", () => {
  it("throws for an empty scope", () => {
    expect(() => {
      validateScope({} as never);
    }).toThrow(ZepInvalidArgumentError);
  });

  it("throws when both userId and graphId are set", () => {
    expect(() => {
      validateScope({ userId: "u1", graphId: "g1" } as never);
    }).toThrow(ZepInvalidArgumentError);
  });

  it("accepts exactly one of userId or graphId", () => {
    expect(() => {
      validateScope(userScope("u1"));
    }).not.toThrow();
    expect(() => {
      validateScope(graphIdScope("g1"));
    }).not.toThrow();
  });
});

describe("GraphResource", () => {
  it("create() posts graph_id", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(await readJsonBody(req)).toMatchObject({ graph_id: "g1" });
      writeJson(res, 200, { graph_id: "g1" });
    });
    try {
      const graph = await client.graph.create("g1");
      expect(graph.graphId).toBe("g1");
    } finally {
      await close();
    }
  });

  it("get()/update()/delete() hit the expected paths", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/graph/g1");
      if (req.method === "GET") {
        writeJson(res, 200, { graph_id: "g1", name: "Docs" });
        return;
      }
      if (req.method === "PATCH") {
        writeJson(res, 200, { graph_id: "g1", name: "Renamed" });
        return;
      }
      if (req.method === "DELETE") {
        writeJson(res, 200, {});
        return;
      }
      throw new Error("unexpected method");
    });
    try {
      const got = await client.graph.get("g1");
      expect(got.name).toBe("Docs");
      const updated = await client.graph.update("g1", { name: "Renamed" });
      expect(updated.name).toBe("Renamed");
      await client.graph.delete("g1");
    } finally {
      await close();
    }
  });

  it("add() adds text data scoped to a user", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body).toMatchObject({
        type: "text",
        data: "Ada was born in 1815.",
        user_id: "u1",
      });
      writeJson(res, 200, { uuid: "ep1", user_id: "u1" });
    });

    try {
      const episode = await client.graph.add("text", "Ada was born in 1815.", {
        scope: userScope("u1"),
      });
      expect(episode.uuid).toBe("ep1");
    } finally {
      await close();
    }
  });

  it("add() rejects an invalid scope before making a request", async () => {
    let requestMade = false;
    const { client, close } = await startTestServer((_req, res) => {
      requestMade = true;
      writeJson(res, 200, {});
    });

    try {
      await expect(client.graph.add("text", "x", { scope: {} as never })).rejects.toBeInstanceOf(
        ZepInvalidArgumentError,
      );
      expect(requestMade).toBe(false);
    } finally {
      await close();
    }
  });

  it("addBatch() rejects more than 20 episodes", async () => {
    const { client, close } = await startTestServer((_req, _res) => {
      throw new Error("should not make a request");
    });

    try {
      const episodes = Array.from({ length: 21 }, () => ({ type: "text" as const, data: "x" }));
      await expect(client.graph.addBatch(episodes, userScope("u1"))).rejects.toBeInstanceOf(
        ZepInvalidArgumentError,
      );
    } finally {
      await close();
    }
  });

  it("addBatch() posts normalized episodes", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body["episodes"]).toEqual([{ type: "text", data: "hello" }]);
      writeJson(res, 200, { episodes: [{ uuid: "ep1" }] });
    });

    try {
      const episodes = await client.graph.addBatch(
        [{ type: "text", data: "hello" }],
        userScope("u1"),
      );
      expect(episodes[0]?.uuid).toBe("ep1");
    } finally {
      await close();
    }
  });

  it("search() returns parsed edges and nodes", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, {
        edges: [{ uuid: "e1", fact: "Ada loves math" }],
        nodes: [{ uuid: "n1", name: "Ada" }],
      });
    });

    try {
      const result = await client.graph.search("math", { scope: userScope("u1"), limit: 5 });
      expect(result.edges[0]?.fact).toBe("Ada loves math");
      expect(result.nodes[0]?.name).toBe("Ada");
    } finally {
      await close();
    }
  });

  it("clone() requires a valid scope", async () => {
    const { client, close } = await startTestServer((_req, _res) => {
      throw new Error("should not make a request");
    });

    try {
      await expect(client.graph.clone({ scope: {} as never })).rejects.toBeInstanceOf(
        ZepInvalidArgumentError,
      );
    } finally {
      await close();
    }
  });

  it("listAllGraphs()/listAll() paginate correctly", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/graph/list-all");
      const page = query(req)["pageNumber"];
      if (page === "1") {
        writeJson(res, 200, { graphs: [{ graph_id: "g1" }, { graph_id: "g2" }], total_count: 3 });
      } else {
        writeJson(res, 200, { graphs: [{ graph_id: "g3" }], total_count: 3 });
      }
    });

    try {
      const ids: string[] = [];
      for await (const graph of client.graph.listAll({ pageSize: 2 })) {
        ids.push(graph.graphId);
      }
      expect(ids).toEqual(["g1", "g2", "g3"]);
    } finally {
      await close();
    }
  });

  it("addFactTriple() posts fact and node names", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      expect(body).toMatchObject({
        fact: "works at",
        source_node_name: "Ada",
        target_node_name: "Analytical Engine",
      });
      writeJson(res, 200, {});
    });

    try {
      await client.graph.addFactTriple("works at", "Ada", "Analytical Engine", userScope("u1"));
    } finally {
      await close();
    }
  });

  it("setOntology()/listOntology() round-trip", async () => {
    const { client, close } = await startTestServer((req, res) => {
      if (req.method === "PUT") {
        writeJson(res, 200, {});
        return;
      }
      writeJson(res, 200, { entities: ["Person"] });
    });

    try {
      await client.graph.setOntology({ entities: [] }, userScope("u1"));
      const ontology = await client.graph.listOntology(userScope("u1"));
      expect(ontology["entities"]).toEqual(["Person"]);
    } finally {
      await close();
    }
  });

  it("warmCache() issues a GET", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/graph/warm-cache");
      writeJson(res, 200, {});
    });

    try {
      await client.graph.warmCache(userScope("u1"));
    } finally {
      await close();
    }
  });
});
