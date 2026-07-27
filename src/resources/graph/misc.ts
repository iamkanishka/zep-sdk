import type { ResolvedZepConfig } from "../../config.js";
import { request } from "../../http.js";
import { arrayOf, asRaw, str, strOpt, type Raw } from "../../internal/raw.js";
import { scopeToBody, scopeToQuery, validateScope, type GraphScope } from "./shared.js";
import { mapThreadSummary, type ThreadSummary } from "../thread.js";

/**
 * Custom entity/edge extraction instructions for a user's or graph's
 * graph - free-text guidance steering what Zep extracts during ingestion
 * (e.g. "always extract monetary amounts as Money-labeled nodes").
 */
export class GraphCustomInstructionsResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Sets (replaces) the custom instructions for a user's or graph's graph. */
  async set(instructions: string, scope: GraphScope): Promise<void> {
    validateScope(scope);
    await request(this.config, {
      method: "PUT",
      path: "/api/v2/graph/custom-instructions",
      body: { instructions, ...scopeToBody(scope) },
    });
  }

  /** Returns the custom instructions currently set for a user's or graph's graph. */
  async get(scope: GraphScope): Promise<{ instructions: string }> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/custom-instructions",
      query: scopeToQuery(scope),
    });
    return { instructions: str(asRaw(raw), "instructions") };
  }
}

/** A standalone, timestamped note attached directly to a graph. */
export interface Observation {
  uuid?: string;
  content: string;
  createdAt?: string;
}

function mapObservation(raw: Raw): Observation {
  return {
    uuid: strOpt(raw, "uuid"),
    content: str(raw, "content"),
    createdAt: strOpt(raw, "created_at"),
  };
}

export interface AddObservationParams {
  scope: GraphScope;
  createdAt?: string;
}

export interface ListObservationsParams {
  scope: GraphScope;
  limit?: number;
  cursor?: string;
}

/**
 * Standalone, timestamped notes attached directly to a user's or graph's
 * graph outside of the thread/episode ingestion flow.
 */
export class GraphObservationsResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Adds an observation to a user's or graph's graph. */
  async add(content: string, params: AddObservationParams): Promise<Observation> {
    validateScope(params.scope);
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/graph/observations",
      body: { content, ...scopeToBody(params.scope), created_at: params.createdAt },
    });
    return mapObservation(asRaw(raw));
  }

  /** Lists observations for a user's or graph's graph, paginated. */
  async list(params: ListObservationsParams): Promise<Observation[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/observations",
      query: { ...scopeToQuery(params.scope), limit: params.limit, cursor: params.cursor },
    });
    return arrayOf(asRaw(raw), "observations", mapObservation);
  }
}

export interface ListThreadSummariesParams {
  scope: GraphScope;
  limit?: number;
  cursor?: string;
}

/**
 * Access to the thread summaries that have been folded into a user's or
 * graph's knowledge graph (as distinct from `client.thread.getSummary`,
 * which returns a single thread's own rolling summary directly).
 */
export class GraphThreadSummariesResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Lists thread summaries folded into a user's or graph's graph, paginated. */
  async list(params: ListThreadSummariesParams): Promise<ThreadSummary[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/thread-summaries",
      query: { ...scopeToQuery(params.scope), limit: params.limit, cursor: params.cursor },
    });
    return arrayOf(asRaw(raw), "summaries", mapThreadSummary);
  }
}
