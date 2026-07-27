import { describe, expect, it } from "vitest";
import { startTestServer, readJsonBody, writeJson, pathname } from "../test-support/server.js";

describe("ContextResource", () => {
  it("listTemplates() returns all templates", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/context-templates");
      writeJson(res, 200, { templates: [{ template_id: "tpl1", name: "default" }] });
    });
    try {
      const templates = await client.context.listTemplates();
      expect(templates[0]?.templateId).toBe("tpl1");
    } finally {
      await close();
    }
  });

  it("getTemplate() fetches a single template", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/context-templates/tpl1");
      writeJson(res, 200, { template_id: "tpl1", name: "default", template: "{{.Facts}}" });
    });
    try {
      const tpl = await client.context.getTemplate("tpl1");
      expect(tpl.template).toBe("{{.Facts}}");
    } finally {
      await close();
    }
  });

  it("createTemplate() posts name and template", async () => {
    const { client, close } = await startTestServer(async (req, res) => {
      expect(await readJsonBody(req)).toEqual({ name: "custom", template: "{{.Summary}}" });
      writeJson(res, 200, { template_id: "tpl2", name: "custom", template: "{{.Summary}}" });
    });
    try {
      const tpl = await client.context.createTemplate("custom", "{{.Summary}}");
      expect(tpl.templateId).toBe("tpl2");
    } finally {
      await close();
    }
  });

  it("updateTemplate() patches a template", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(req.method).toBe("PATCH");
      writeJson(res, 200, { template_id: "tpl1", name: "renamed" });
    });
    try {
      const tpl = await client.context.updateTemplate("tpl1", { name: "renamed" });
      expect(tpl.name).toBe("renamed");
    } finally {
      await close();
    }
  });

  it("deleteTemplate() issues a DELETE", async () => {
    const { client, close } = await startTestServer((req, res) => {
      expect(pathname(req)).toBe("/api/v2/context-templates/tpl1");
      expect(req.method).toBe("DELETE");
      writeJson(res, 200, {});
    });
    try {
      await client.context.deleteTemplate("tpl1");
    } finally {
      await close();
    }
  });
});
