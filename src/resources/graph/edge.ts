import type { ResolvedZepConfig } from "../../config.js";
import { request } from "../../http.js";
import { arrayOf, asRaw } from "../../internal/raw.js";
import { mapEdge, scopeToQuery, type Edge, type GraphScope } from "./shared.js";

export interface ListEdgesParams {
  scope: GraphScope;
  limit?: number;
  uuidCursor?: string;
}

export interface UpdateEdgeParams {
  fact?: string;
  rating?: number;
}

/** Operations on individual graph edges (facts/relationships between nodes). */
export class GraphEdgeResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Fetches a single edge by uuid. */
  async get(uuid: string): Promise<Edge> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/graph/edge/${encodeURIComponent(uuid)}`,
    });
    return mapEdge(asRaw(raw));
  }

  /** Lists edges for a user's or graph's graph, paginated. */
  async getByUserOrGraph(params: ListEdgesParams): Promise<Edge[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/edge",
      query: { ...scopeToQuery(params.scope), limit: params.limit, uuid_cursor: params.uuidCursor },
    });
    return arrayOf(asRaw(raw), "edges", mapEdge);
  }

  /** Updates an edge's fact and/or rating. */
  async update(uuid: string, params: UpdateEdgeParams): Promise<Edge> {
    const raw = await request(this.config, {
      method: "PATCH",
      path: `/api/v2/graph/edge/${encodeURIComponent(uuid)}`,
      body: { fact: params.fact, rating: params.rating },
    });
    return mapEdge(asRaw(raw));
  }

  /** Deletes an edge by uuid. */
  async delete(uuid: string): Promise<void> {
    await request(this.config, {
      method: "DELETE",
      path: `/api/v2/graph/edge/${encodeURIComponent(uuid)}`,
    });
  }
}
