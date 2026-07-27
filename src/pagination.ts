/** Fetches one page given a 1-indexed page number and page size. */
export type FetchPage<T> = (
  pageNumber: number,
  pageSize: number,
) => Promise<{ items: T[]; totalCount?: number }>;

/**
 * Lazily walks every page of a paginated list endpoint as an async
 * generator, so callers can use `for await...of`:
 *
 * ```ts
 * for await (const thread of client.thread.listAll({ pageSize: 100 })) {
 *   console.log(thread.threadId);
 * }
 * ```
 *
 * Halts after an empty page, after `totalCount` items have been yielded
 * (if known), or after a page shorter than `pageSize` (if `totalCount` is
 * never provided).
 */
export async function* paginate<T>(pageSize: number, fetchPage: FetchPage<T>): AsyncGenerator<T> {
  let pageNumber = 1;
  let fetchedSoFar = 0;
  let total: number | undefined;

  for (;;) {
    const { items, totalCount } = await fetchPage(pageNumber, pageSize);
    if (totalCount !== undefined) total = totalCount;

    if (items.length === 0) return;

    for (const item of items) {
      yield item;
    }

    fetchedSoFar += items.length;
    pageNumber += 1;

    const doneByTotal = total !== undefined && fetchedSoFar >= total;
    const doneByShortPage = total === undefined && items.length < pageSize;
    if (doneByTotal || doneByShortPage) return;
  }
}
