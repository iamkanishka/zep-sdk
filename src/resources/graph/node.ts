import type { ResolvedZepConfig } from "../../config.js";
import { request } from "../../http.js";
import { arrayOf, asRaw } from "../../internal/raw.js";
import {
  mapEdge,
  mapNode,
  scopeToQuery,
  type Edge,
  type GraphNode,
  type GraphScope,
} from "./shared.js";

export interface ListNodesParams {
  scope: GraphScope;
  limit?: number;
  uuidCursor?: string;
}

/** Operations on individual graph entity nodes. */
export class GraphNodeResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Fetches a single node by uuid. */
  async get(uuid: string): Promise<GraphNode> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/graph/node/${encodeURIComponent(uuid)}`,
    });
    return mapNode(asRaw(raw));
  }

  /** Lists nodes for a user's or graph's graph, paginated. */
  async getByUserOrGraph(params: ListNodesParams): Promise<GraphNode[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/node",
      query: { ...scopeToQuery(params.scope), limit: params.limit, uuid_cursor: params.uuidCursor },
    });
    return arrayOf(asRaw(raw), "nodes", mapNode);
  }

  /** Returns the edges directly connected to a node. */
  async getEdges(uuid: string): Promise<Edge[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/graph/node/${encodeURIComponent(uuid)}/edges`,
    });
    return arrayOf(asRaw(raw), "edges", mapEdge);
  }
}
