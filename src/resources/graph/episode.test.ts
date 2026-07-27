import { describe, expect, it } from "vitest";
import { startTestServer, writeJson, query } from "../../test-support/server.js";
import { userScope } from "./shared.js";

describe("GraphEpisodeResource", () => {
  it("get() fetches a single episode", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { uuid: "ep1", content: "some text" });
    });
    try {
      const episode = await client.graph.episode.get("ep1");
      expect(episode.content).toBe("some text");
    } finally {
      await close();
    }
  });

  it("getByUserOrGraph() returns episodes and totalCount", async () => {
    const { client, close } = await startTestServer((_req, res) => {
      writeJson(res, 200, { episodes: [{ uuid: "ep1" }], total_count: 1 });
    });
    try {
      const result = await client.graph.episode.getByUserOrGraph({ scope: userScope("u1") });
      expect(result.episodes).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    } finally {
      await close();
    }
  });

  it("stream() follows the cursor across pages", async () => {
    let calls = 0;
    const { client, close } = await startTestServer((req, res) => {
      calls++;
      const cursor = query(req)["cursor"];
      if (cursor === undefined || cursor === "") {
        writeJson(res, 200, { episodes: [{ uuid: "ep1" }, { uuid: "ep2" }] });
      } else if (cursor === "ep2") {
        writeJson(res, 200, { episodes: [{ uuid: "ep3" }] });
      } else {
        throw new Error(`unexpected cursor: ${cursor}`);
      }
    });

    try {
      const ids: string[] = [];
      for await (const episode of client.graph.episode.stream({
        scope: userScope("u1"),
        limit: 2,
      })) {
        if (episode.uuid) ids.push(episode.uuid);
      }
      expect(ids).toEqual(["ep1", "ep2", "ep3"]);
      expect(calls).toBe(2);
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
      await client.graph.episode.delete("ep1");
    } finally {
      await close();
    }
  });
});
