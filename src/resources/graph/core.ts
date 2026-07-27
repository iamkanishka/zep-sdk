import type { ResolvedZepConfig } from "../../config.js";
import { ZepInvalidArgumentError } from "../../errors.js";
import { request } from "../../http.js";
import { paginate } from "../../pagination.js";
import { arrayOf, asRaw, type Raw } from "../../internal/raw.js";
import {
  mapEpisode,
  mapGraph,
  mapGraphList,
  mapSearchResults,
  scopeToBody,
  scopeToQuery,
  validateScope,
  type Episode,
  type Graph,
  type GraphList,
  type GraphScope,
  type SearchResults,
} from "./shared.js";

export type {
  Edge,
  Episode,
  Graph,
  GraphList,
  GraphNode,
  GraphScope,
  SearchResults,
} from "./shared.js";
export { graphIdScope, userScope } from "./shared.js";

export interface CreateGraphParams {
  name?: string;
  description?: string;
}

export interface UpdateGraphParams {
  name?: string;
  description?: string;
}

export interface ListGraphsParams {
  pageNumber?: number;
  pageSize?: number;
}

/** Selects the payload shape for {@link GraphCoreResource.add}. */
export type DataType = "message" | "text" | "json";

export interface AddParams {
  scope: GraphScope;
  sourceDescription?: string;
  createdAt?: string;
}

export interface BatchEpisode {
  type: DataType;
  data: unknown;
}

const MAX_ADD_BATCH_EPISODES = 20;

export interface CloneParams {
  scope: GraphScope;
  targetUserId?: string;
  targetGraphId?: string;
}

export interface SearchParams {
  scope: GraphScope;
  limit?: number;
  /** Reranks results by node distance from this node. */
  centerNodeUuid?: string;
  /** Origin nodes for breadth-first search. */
  bfsOriginNodeUuids?: string[];
}

/**
 * Core Graph operations - the temporal knowledge graph, Zep's central
 * memory store. A graph is scoped to either a `userId` (the default
 * per-user graph) or a standalone `graphId` (for domain/group knowledge
 * not tied to one user), via a {@link GraphScope}.
 */
export class GraphCoreResource {
  constructor(protected readonly config: ResolvedZepConfig) {}

  /** Creates a new standalone graph with the given graphId. */
  async create(graphId: string, params?: CreateGraphParams): Promise<Graph> {
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/graph",
      body: { graph_id: graphId, name: params?.name, description: params?.description },
    });
    return mapGraph(asRaw(raw));
  }

  /** Fetches a single graph by graphId. */
  async get(graphId: string): Promise<Graph> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/graph/${encodeURIComponent(graphId)}`,
    });
    return mapGraph(asRaw(raw));
  }

  /** Updates a graph's name and/or description. */
  async update(graphId: string, params: UpdateGraphParams): Promise<Graph> {
    const raw = await request(this.config, {
      method: "PATCH",
      path: `/api/v2/graph/${encodeURIComponent(graphId)}`,
      body: { name: params.name, description: params.description },
    });
    return mapGraph(asRaw(raw));
  }

  /** Deletes a standalone graph by graphId. */
  async delete(graphId: string): Promise<void> {
    await request(this.config, {
      method: "DELETE",
      path: `/api/v2/graph/${encodeURIComponent(graphId)}`,
    });
  }

  /**
   * Lists all graphs in the project, paginated. To list users rather
   * than standalone graphs, use `client.user.listOrdered`.
   */
  async listAllGraphs(params?: ListGraphsParams): Promise<GraphList> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/list-all",
      query: { pageNumber: params?.pageNumber, pageSize: params?.pageSize },
    });
    return mapGraphList(asRaw(raw));
  }

  /** Lazily walks every graph in the project across all pages. */
  listAll(params?: ListGraphsParams): AsyncGenerator<Graph> {
    const pageSize = params?.pageSize ?? 25;
    return paginate(pageSize, async (pageNumber, pageSize) => {
      const result = await this.listAllGraphs({ pageNumber, pageSize });
      return { items: result.graphs, totalCount: result.totalCount };
    });
  }

  /**
   * Adds data to a user's or graph's knowledge graph. `data` is a string
   * for "text"/"json" payloads, or a message-shaped value for "message".
   * Data is capped at 10,000 characters per call - chunk larger documents
   * before calling this.
   */
  async add(dataType: DataType, data: unknown, params: AddParams): Promise<Episode> {
    validateScope(params.scope);
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/graph",
      body: {
        type: dataType,
        data,
        ...scopeToBody(params.scope),
        source_description: params.sourceDescription,
        created_at: params.createdAt,
      },
    });
    return mapEpisode(asRaw(raw));
  }

  /**
   * Adds up to 20 episodes to a graph concurrently.
   *
   * Episodes are processed concurrently rather than sequentially, so
   * temporal relationships between them are not captured - use this only
   * for static/order-independent data (documents, bulk imports), not
   * evolving chat history. For larger or mixed-destination bulk loads,
   * use `client.batch` instead.
   */
  async addBatch(episodes: BatchEpisode[], scope: GraphScope): Promise<Episode[]> {
    if (episodes.length > MAX_ADD_BATCH_EPISODES) {
      throw new ZepInvalidArgumentError(
        `addBatch accepts at most ${MAX_ADD_BATCH_EPISODES} episodes per call, got ${episodes.length}`,
      );
    }
    validateScope(scope);

    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/graph/add-batch",
      body: { episodes, ...scopeToBody(scope) },
    });
    return arrayOf(asRaw(raw), "episodes", mapEpisode);
  }

  /**
   * Adds a manually-specified fact triple: `fact` connecting
   * `sourceNodeName` to `targetNodeName`. Zep creates new nodes/edges, or
   * reuses existing ones it judges to represent the same entities.
   */
  async addFactTriple(
    fact: string,
    sourceNodeName: string,
    targetNodeName: string,
    scope: GraphScope,
  ): Promise<void> {
    validateScope(scope);
    await request(this.config, {
      method: "POST",
      path: "/api/v2/graph/add-fact-triple",
      body: {
        fact,
        source_node_name: sourceNodeName,
        target_node_name: targetNodeName,
        ...scopeToBody(scope),
      },
    });
  }

  /**
   * Clones a user's or graph's knowledge graph under a new identifier.
   * The target must not already exist - it is created as part of
   * cloning. If omitted, Zep auto-generates one. Fact ratings are not
   * carried over.
   */
  async clone(params: CloneParams): Promise<void> {
    validateScope(params.scope);
    await request(this.config, {
      method: "POST",
      path: "/api/v2/graph/clone",
      body: {
        ...scopeToBody(params.scope),
        target_user_id: params.targetUserId,
        target_graph_id: params.targetGraphId,
      },
    });
  }

  /**
   * Performs a graph search, returning matching facts (edges) and/or
   * entity nodes. `query` is capped at 400 bytes.
   */
  async search(query: string, params: SearchParams): Promise<SearchResults> {
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/graph/search",
      body: {
        query,
        ...scopeToBody(params.scope),
        limit: params.limit,
        center_node_uuid: params.centerNodeUuid,
        bfs_origin_node_uuids: params.bfsOriginNodeUuids,
      },
    });
    return mapSearchResults(asRaw(raw));
  }

  /**
   * Sets the entity/edge type ontology for a user's or graph's knowledge
   * graph. `ontology`'s shape follows the Zep API reference for ontology
   * definitions.
   */
  async setOntology(ontology: Record<string, unknown>, scope: GraphScope): Promise<void> {
    validateScope(scope);
    await request(this.config, {
      method: "PUT",
      path: "/api/v2/graph/ontology",
      body: { ...ontology, ...scopeToBody(scope) },
    });
  }

  /** Returns the entity/edge type ontology currently set for a user's or graph's graph. */
  async listOntology(scope: GraphScope): Promise<Raw> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/ontology",
      query: scopeToQuery(scope),
    });
    return asRaw(raw);
  }

  /**
   * Runs pattern detection over a user's or graph's graph.
   *
   * Experimental: subject to change upstream - treat the response shape
   * as opaque/unstable.
   */
  async detectPatterns(scope: GraphScope): Promise<Raw> {
    validateScope(scope);
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/graph/detect-patterns",
      body: { ...scopeToBody(scope) },
    });
    return asRaw(raw);
  }

  /**
   * Pre-warms Zep's cache for a user's or graph's graph, reducing latency
   * on the next getUserContext or search call. Fire-and-forget - call
   * this ahead of an expected burst of activity rather than on the hot
   * path.
   */
  async warmCache(scope: GraphScope): Promise<void> {
    await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/warm-cache",
      query: scopeToQuery(scope),
    });
  }
}
