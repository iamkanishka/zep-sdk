import { ZepInvalidArgumentError } from "../../errors.js";
import {
  arrayOf,
  num,
  numOpt,
  recordOpt,
  str,
  strArray,
  strOpt,
  type Raw,
} from "../../internal/raw.js";

/** A named graph - either a user graph or a standalone/group graph. */
export interface Graph {
  graphId: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function mapGraph(raw: Raw): Graph {
  return {
    graphId: str(raw, "graph_id"),
    name: strOpt(raw, "name"),
    description: strOpt(raw, "description"),
    createdAt: strOpt(raw, "created_at"),
    updatedAt: strOpt(raw, "updated_at"),
  };
}

/** Paginated envelope returned by `client.graph.listAllGraphs`. */
export interface GraphList {
  graphs: Graph[];
  responseCount: number;
  totalCount: number;
}

export function mapGraphList(raw: Raw): GraphList {
  return {
    graphs: arrayOf(raw, "graphs", mapGraph),
    responseCount: num(raw, "response_count"),
    totalCount: num(raw, "total_count"),
  };
}

/** A single unit of data ingested into a graph via `client.graph.add`. */
export interface Episode {
  uuid?: string;
  content?: string;
  source?: string;
  sourceDescription?: string;
  createdAt?: string;
  validAt?: string;
  graphId?: string;
  userId?: string;
}

export function mapEpisode(raw: Raw): Episode {
  return {
    uuid: strOpt(raw, "uuid"),
    content: strOpt(raw, "content"),
    source: strOpt(raw, "source"),
    sourceDescription: strOpt(raw, "source_description"),
    createdAt: strOpt(raw, "created_at"),
    validAt: strOpt(raw, "valid_at"),
    graphId: strOpt(raw, "graph_id"),
    userId: strOpt(raw, "user_id"),
  };
}

/**
 * A fact/relationship edge between two nodes in a graph.
 *
 * `score` is the re-ranker relevance score returned by
 * `client.graph.search` (not comparable across different rerankers -
 * there is intentionally no universal minimum-score filter on search).
 * `rating` is a legacy fact-rating field; fact ratings were deprecated
 * entirely in Zep's February 2026 deprecation wave and this will
 * generally be undefined on new data.
 */
export interface Edge {
  uuid?: string;
  fact?: string;
  name?: string;
  sourceNodeUuid?: string;
  targetNodeUuid?: string;
  createdAt?: string;
  validAt?: string;
  invalidAt?: string;
  expiredAt?: string;
  score?: number;
  rating?: number;
}

export function mapEdge(raw: Raw): Edge {
  return {
    uuid: strOpt(raw, "uuid"),
    fact: strOpt(raw, "fact"),
    name: strOpt(raw, "name"),
    sourceNodeUuid: strOpt(raw, "source_node_uuid"),
    targetNodeUuid: strOpt(raw, "target_node_uuid"),
    createdAt: strOpt(raw, "created_at"),
    validAt: strOpt(raw, "valid_at"),
    invalidAt: strOpt(raw, "invalid_at"),
    expiredAt: strOpt(raw, "expired_at"),
    score: numOpt(raw, "score"),
    rating: numOpt(raw, "rating"),
  };
}

/** An entity node in a graph. */
export interface GraphNode {
  uuid?: string;
  name?: string;
  summary?: string;
  labels: string[];
  createdAt?: string;
  attributes?: Record<string, unknown>;
}

export function mapNode(raw: Raw): GraphNode {
  return {
    uuid: strOpt(raw, "uuid"),
    name: strOpt(raw, "name"),
    summary: strOpt(raw, "summary"),
    labels: strArray(raw, "labels"),
    createdAt: strOpt(raw, "created_at"),
    attributes: recordOpt(raw, "attributes"),
  };
}

/** Results of `client.graph.search` - facts (edges) and/or nodes, depending on what matched. */
export interface SearchResults {
  edges: Edge[];
  nodes: GraphNode[];
}

export function mapSearchResults(raw: Raw): SearchResults {
  return {
    edges: arrayOf(raw, "edges", mapEdge),
    nodes: arrayOf(raw, "nodes", mapNode),
  };
}

/**
 * Identifies which graph an operation applies to: exactly one of userId
 * or graphId must be set. Construct one with {@link userScope} or
 * {@link graphIdScope}.
 */
export type GraphScope = { userId: string; graphId?: never } | { userId?: never; graphId: string };

/** Scopes an operation to a user's graph. */
export function userScope(userId: string): GraphScope {
  return { userId };
}

/** Scopes an operation to a standalone/group graph. */
export function graphIdScope(graphId: string): GraphScope {
  return { graphId };
}

/** @throws {ZepInvalidArgumentError} if scope has neither or both of userId/graphId set. */
export function validateScope(scope: GraphScope): void {
  const hasUser = "userId" in scope && scope.userId !== undefined;
  const hasGraph = "graphId" in scope && scope.graphId !== undefined;
  if (hasUser === hasGraph) {
    throw new ZepInvalidArgumentError(
      "Exactly one of { userId } or { graphId } must be set on a GraphScope.",
    );
  }
}

export function scopeToBody(scope: GraphScope): Record<string, unknown> {
  return scope.userId !== undefined ? { user_id: scope.userId } : { graph_id: scope.graphId };
}

export function scopeToQuery(scope: GraphScope): Record<string, string | undefined> {
  return scope.userId !== undefined ? { user_id: scope.userId } : { graph_id: scope.graphId };
}
