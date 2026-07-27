/**
 * Internal helpers for safely reading fields off a decoded JSON response
 * (an `unknown`-shaped object from `fetch` + `JSON.parse`) into typed
 * domain objects.
 *
 * These intentionally do NOT recursively rename keys (e.g. snake_case to
 * camelCase) across the whole payload - that would silently mangle
 * arbitrary user-supplied nested objects like `metadata` or graph
 * `attributes`. Instead, each resource's mapper function explicitly picks
 * the known top-level wire fields it cares about and leaves opaque
 * nested objects untouched.
 */

export type Raw = Record<string, unknown>;

export function asRaw(value: unknown): Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : {};
}

export function str(raw: Raw, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v : "";
}

export function strOpt(raw: Raw, key: string): string | undefined {
  const v = raw[key];
  return typeof v === "string" ? v : undefined;
}

export function num(raw: Raw, key: string): number {
  const v = raw[key];
  return typeof v === "number" ? v : 0;
}

export function numOpt(raw: Raw, key: string): number | undefined {
  const v = raw[key];
  return typeof v === "number" ? v : undefined;
}

export function bool(raw: Raw, key: string): boolean {
  const v = raw[key];
  return typeof v === "boolean" ? v : false;
}

export function boolOpt(raw: Raw, key: string): boolean | undefined {
  const v = raw[key];
  return typeof v === "boolean" ? v : undefined;
}

export function recordOpt(raw: Raw, key: string): Record<string, unknown> | undefined {
  const v = raw[key];
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

export function strArray(raw: Raw, key: string): string[] {
  const v = raw[key];
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === "string") : [];
}

export function arrayOf<T>(raw: Raw, key: string, mapItem: (item: Raw) => T): T[] {
  const v = raw[key];
  return Array.isArray(v) ? v.map((item) => mapItem(asRaw(item))) : [];
}
