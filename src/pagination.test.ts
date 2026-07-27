import { describe, expect, it } from "vitest";
import { paginate } from "./pagination.js";

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) {
    out.push(item);
  }
  return out;
}

describe("paginate", () => {
  it("walks all pages until totalCount is reached", async () => {
    const pages: Record<number, number[]> = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7] };

    const items = await collect(
      paginate(3, (pageNumber) =>
        Promise.resolve({ items: pages[pageNumber] ?? [], totalCount: 7 }),
      ),
    );

    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("halts on an empty page when totalCount is unknown", async () => {
    const pages: Record<number, number[]> = { 1: [1, 2], 2: [] };

    const items = await collect(
      paginate(2, (pageNumber) => Promise.resolve({ items: pages[pageNumber] ?? [] })),
    );

    expect(items).toEqual([1, 2]);
  });

  it("halts when a page is shorter than pageSize and totalCount is unknown", async () => {
    let calls = 0;
    const items = await collect(
      paginate(5, (pageNumber) => {
        calls++;
        return Promise.resolve({ items: pageNumber === 1 ? [1] : [] });
      }),
    );

    expect(items).toEqual([1]);
    expect(calls).toBe(1);
  });

  it("propagates a fetch error", async () => {
    const gen = paginate<number>(10, () => Promise.reject(new Error("boom")));
    await expect(collect(gen)).rejects.toThrow("boom");
  });

  it("only fetches pages that are actually consumed (lazy)", async () => {
    let calls = 0;
    const gen = paginate(1, (pageNumber) => {
      calls++;
      return Promise.resolve({ items: [pageNumber] });
    });

    const first = await gen.next();
    const second = await gen.next();

    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
    expect(calls).toBe(2);
  });
});
