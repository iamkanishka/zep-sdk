import type { ResolvedZepConfig } from "../../config.js";
import { request } from "../../http.js";
import { arrayOf, asRaw, num } from "../../internal/raw.js";
import { mapEpisode, scopeToQuery, type Episode, type GraphScope } from "./shared.js";

export interface ListEpisodesParams {
  scope: GraphScope;
  limit?: number;
  cursor?: string;
}

export interface EpisodeList {
  episodes: Episode[];
  totalCount: number;
}

/** Operations on individual graph episodes (units of ingested data). */
export class GraphEpisodeResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Fetches a single episode by uuid. */
  async get(uuid: string): Promise<Episode> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/graph/episode/${encodeURIComponent(uuid)}`,
    });
    return mapEpisode(asRaw(raw));
  }

  /** Lists episodes for a user's or graph's graph, paginated. */
  async getByUserOrGraph(params: ListEpisodesParams): Promise<EpisodeList> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/graph/episode",
      query: { ...scopeToQuery(params.scope), limit: params.limit, cursor: params.cursor },
    });
    const r = asRaw(raw);
    return { episodes: arrayOf(r, "episodes", mapEpisode), totalCount: num(r, "total_count") };
  }

  /**
   * Lazily walks every episode for a user's or graph's graph, following
   * the response cursor.
   *
   * This assumes the last episode's uuid in a page can be used as the
   * next page's cursor, consistent with the cursor pattern used
   * elsewhere in the API. If the API instead returns an explicit
   * next-cursor field, this would need a small update to read it
   * directly from the response - worth confirming against a live
   * response before relying on this for very large graphs.
   */
  async *stream(params: ListEpisodesParams): AsyncGenerator<Episode> {
    const pageSize = params.limit ?? 100;
    let cursor = params.cursor;

    for (;;) {
      const result = await this.getByUserOrGraph({ ...params, limit: pageSize, cursor });
      if (result.episodes.length === 0) return;

      for (const episode of result.episodes) {
        yield episode;
      }

      const last = result.episodes[result.episodes.length - 1];
      if (!last?.uuid || result.episodes.length < pageSize) return;
      cursor = last.uuid;
    }
  }

  /** Deletes an episode by uuid. */
  async delete(uuid: string): Promise<void> {
    await request(this.config, {
      method: "DELETE",
      path: `/api/v2/graph/episode/${encodeURIComponent(uuid)}`,
    });
  }
}
