import type { ResolvedZepConfig } from "../config.js";
import { request } from "../http.js";
import { arrayOf, asRaw, str, type Raw } from "../internal/raw.js";

/** A custom context-rendering template, referenced by templateId from `client.thread.getUserContext`. */
export interface ContextTemplate {
  templateId: string;
  name: string;
  template: string;
}

function mapContextTemplate(raw: Raw): ContextTemplate {
  return {
    templateId: str(raw, "template_id") || str(raw, "id"),
    name: str(raw, "name"),
    template: str(raw, "template"),
  };
}

export interface UpdateTemplateParams {
  name?: string;
  template?: string;
}

/**
 * Custom context-rendering templates. Access via `client.context`.
 */
export class ContextResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Lists all context templates in the project. */
  async listTemplates(): Promise<ContextTemplate[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/context-templates",
    });
    return arrayOf(asRaw(raw), "templates", mapContextTemplate);
  }

  /** Fetches a single context template by templateId. */
  async getTemplate(templateId: string): Promise<ContextTemplate> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/context-templates/${encodeURIComponent(templateId)}`,
    });
    return mapContextTemplate(asRaw(raw));
  }

  /** Creates a new context template with the given name and template body. */
  async createTemplate(name: string, template: string): Promise<ContextTemplate> {
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/context-templates",
      body: { name, template },
    });
    return mapContextTemplate(asRaw(raw));
  }

  /** Updates an existing context template's name and/or template body. */
  async updateTemplate(templateId: string, params: UpdateTemplateParams): Promise<ContextTemplate> {
    const raw = await request(this.config, {
      method: "PATCH",
      path: `/api/v2/context-templates/${encodeURIComponent(templateId)}`,
      body: { name: params.name, template: params.template },
    });
    return mapContextTemplate(asRaw(raw));
  }

  /** Deletes a context template by templateId. */
  async deleteTemplate(templateId: string): Promise<void> {
    await request(this.config, {
      method: "DELETE",
      path: `/api/v2/context-templates/${encodeURIComponent(templateId)}`,
    });
  }
}
