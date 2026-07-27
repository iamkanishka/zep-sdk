import type { ResolvedZepConfig } from "../config.js";
import { request } from "../http.js";
import { asRaw, str, type Raw } from "../internal/raw.js";

/** Settings for the API key currently in use (the project the key was issued under). */
export interface Project {
  projectUuid: string;
  name: string;
  createdAt: string;
}

function mapProject(raw: Raw): Project {
  return {
    projectUuid: str(raw, "project_uuid") || str(raw, "uuid"),
    name: str(raw, "name"),
    createdAt: str(raw, "created_at"),
  };
}

export interface UpdateProjectParams {
  name?: string;
}

/** Project-level settings. Access via `client.project`. */
export class ProjectResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Returns settings for the current project. */
  async get(): Promise<Project> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/projects/current",
    });
    return mapProject(asRaw(raw));
  }

  /** Updates settings for the current project (e.g. name). */
  async update(params: UpdateProjectParams): Promise<Project> {
    const raw = await request(this.config, {
      method: "PATCH",
      path: "/api/v2/projects/current",
      body: { name: params.name },
    });
    return mapProject(asRaw(raw));
  }
}
