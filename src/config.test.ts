import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveConfig, DEFAULT_BASE_URL, ZepConfigError } from "./config.js";

describe("resolveConfig", () => {
  const originalEnv = process.env["ZEP_API_KEY"];

  beforeEach(() => {
    delete process.env["ZEP_API_KEY"];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["ZEP_API_KEY"];
    } else {
      process.env["ZEP_API_KEY"] = originalEnv;
    }
  });

  it("resolves apiKey from explicit options with highest precedence", () => {
    process.env["ZEP_API_KEY"] = "from_env";
    const config = resolveConfig({ apiKey: "from_opts" }, "1.0.0");
    expect(config.apiKey).toBe("from_opts");
  });

  it("falls back to ZEP_API_KEY env var when apiKey is omitted", () => {
    process.env["ZEP_API_KEY"] = "from_env";
    const config = resolveConfig({}, "1.0.0");
    expect(config.apiKey).toBe("from_env");
  });

  it("throws ZepConfigError when no api key can be resolved", () => {
    expect(() => resolveConfig({}, "1.0.0")).toThrow(ZepConfigError);
  });

  it("defaults baseUrl and trims trailing slashes", () => {
    const config = resolveConfig({ apiKey: "z_test", baseUrl: "https://example.com/" }, "1.0.0");
    expect(config.baseUrl).toBe("https://example.com");
  });

  it("uses the library default base URL when unset", () => {
    const config = resolveConfig({ apiKey: "z_test" }, "1.0.0");
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("defaults timeoutMs and maxRetries", () => {
    const config = resolveConfig({ apiKey: "z_test" }, "1.0.0");
    expect(config.timeoutMs).toBe(30_000);
    expect(config.maxRetries).toBe(2);
  });

  it("includes the package version in the default User-Agent", () => {
    const config = resolveConfig({ apiKey: "z_test" }, "9.9.9");
    expect(config.userAgent).toBe("zep-sdk/9.9.9");
  });

  it("uses a custom fetch implementation when provided", () => {
    const customFetch = vi.fn() as unknown as typeof fetch;
    const config = resolveConfig({ apiKey: "z_test", fetch: customFetch }, "1.0.0");
    expect(config.fetch).toBe(customFetch);
  });
});
