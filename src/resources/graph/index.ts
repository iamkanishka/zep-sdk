import type { ResolvedZepConfig } from "../../config.js";
import { GraphCoreResource } from "./core.js";
import { GraphEdgeResource } from "./edge.js";
import { GraphEpisodeResource } from "./episode.js";
import { GraphNodeResource } from "./node.js";
import {
  GraphCustomInstructionsResource,
  GraphObservationsResource,
  GraphThreadSummariesResource,
} from "./misc.js";

export * from "./core.js";
export * from "./edge.js";
export * from "./episode.js";
export * from "./node.js";
export * from "./misc.js";

/**
 * The temporal knowledge graph - Zep's core memory store. Access via
 * `client.graph`.
 *
 * Nested resources are available as properties: `client.graph.edge`,
 * `client.graph.episode`, `client.graph.node`,
 * `client.graph.customInstructions`, `client.graph.observations`,
 * `client.graph.threadSummaries`.
 */
export class GraphResource extends GraphCoreResource {
  readonly edge: GraphEdgeResource;
  readonly episode: GraphEpisodeResource;
  readonly node: GraphNodeResource;
  readonly customInstructions: GraphCustomInstructionsResource;
  readonly observations: GraphObservationsResource;
  readonly threadSummaries: GraphThreadSummariesResource;

  constructor(config: ResolvedZepConfig) {
    super(config);
    this.edge = new GraphEdgeResource(config);
    this.episode = new GraphEpisodeResource(config);
    this.node = new GraphNodeResource(config);
    this.customInstructions = new GraphCustomInstructionsResource(config);
    this.observations = new GraphObservationsResource(config);
    this.threadSummaries = new GraphThreadSummariesResource(config);
  }
}
