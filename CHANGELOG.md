# Changelog

## 1.0.0

Initial release.

- `client.thread` (+ message update), `client.user`, `client.context`,
  `client.graph` (+ `edge`, `episode`, `node`, `customInstructions`,
  `observations`, `threadSummaries`), `client.project`, `client.task`,
  `client.batch`, `verifyWebhook`
- Zero runtime dependencies - built on standard `fetch` and the Web
  Crypto API only, isomorphic across Node 20+, browsers, and edge runtimes
- Dual ESM/CJS build with full `.d.ts` type declarations via tsup
- Automatic retry with exponential backoff on 429/5xx, honoring
  `AbortSignal` cancellation mid-backoff
- Generic `paginate()` async-generator helper backing every
  `list`/`listAll` method, so pagination works with `for await...of`
- `ZepError` with `.reason` classification and `isNotFound`/`isForbidden`/
  etc. type-guard helpers
- `client.batch` implements the three-step lifecycle (`create` → `add` →
  `process`), matching the real API rather than a single-call shortcut
- Reflects Zep's February 2026 deprecation wave: no `minRating`/`mode` on
  `getUserContext`, no `minFactRating`/`minScore` on `search` (`Edge`
  carries a re-ranker `score` field instead)
- Explicit snake_case-to-camelCase response mapping throughout (no naive
  recursive key transformation, which would silently corrupt
  user-supplied `metadata`/`attributes` objects)
