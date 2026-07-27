# zep-sdk

A complete, production-grade TypeScript client for the [Zep](https://www.getzep.com)
AI memory API — Threads, Users, Context Templates, the temporal Knowledge
Graph, Batch ingestion, Projects, Tasks, and Webhook signature verification.

Zero runtime dependencies — built entirely on the standard `fetch` and Web
Crypto APIs, so it works unmodified in Node 20+, browsers, and edge
runtimes. Ships dual ESM/CJS builds with full type declarations.

## Installation

```
npm install zep-sdk
```

## Quick start

```ts
import { ZepClient } from "zep-sdk";

const client = new ZepClient({ apiKey: "z_..." }); // or set ZEP_API_KEY (Node only)

await client.user.add("user-1", { firstName: "Ada", lastName: "Lovelace" });
await client.thread.create("thread-1", "user-1");

await client.thread.addMessages("thread-1", [
  { role: "user", content: "Hi, I'm Ada. I love analytical engines." },
]);

const { context } = await client.thread.getUserContext("thread-1");
console.log(context);
```

## Configuration

A `ZepClient` is built once and is safe to share across concurrent
requests — it holds no mutable request-scoped state.

```ts
const client = new ZepClient({
  apiKey: "z_...",
  baseUrl: "https://api.getzep.com", // default
  maxRetries: 2, // default; 0 disables retries
  timeoutMs: 30_000, // default
  fetch: customFetch, // override for testing or polyfilling
});
```

If `apiKey` is omitted, the client falls back to the `ZEP_API_KEY`
environment variable (Node only — browsers/edge runtimes must pass it
explicitly, since `process.env` isn't available there).

## Resources

| Property                          | Covers                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.thread`                   | list, create, delete, get/add messages, user context, rolling summary, update message                                                       |
| `client.user`                     | add, get, update, delete, `listOrdered`, `getThreads`, summary instructions                                                                 |
| `client.context`                  | context-rendering templates (list/get/create/update/delete)                                                                                 |
| `client.graph`                    | create/get/update/delete/`listAllGraphs`, `add`, `addBatch`, `addFactTriple`, `clone`, `search`, ontology, pattern detection, cache warming |
| `client.graph.edge`               | individual fact/edge CRUD                                                                                                                   |
| `client.graph.episode`            | individual episode CRUD + streaming                                                                                                         |
| `client.graph.node`               | individual node CRUD + connected edges                                                                                                      |
| `client.graph.customInstructions` | per-graph extraction instructions                                                                                                           |
| `client.graph.observations`       | standalone timestamped graph notes                                                                                                          |
| `client.graph.threadSummaries`    | thread summaries folded into a graph                                                                                                        |
| `client.project`                  | current project settings                                                                                                                    |
| `client.task`                     | async task status + polling (`await`)                                                                                                       |
| `client.batch`                    | bulk ingestion jobs: create → add → process → poll/list                                                                                     |
| `verifyWebhook`                   | verify incoming Zep webhook deliveries (HMAC-SHA256 / Svix)                                                                                 |

## Pagination

Paginated list endpoints have a corresponding `listAll`/`stream`-style
async generator, so you can use `for await...of` directly:

```ts
for await (const thread of client.thread.listAll({ pageSize: 100 })) {
  console.log(thread.threadId);
}
```

## Error handling

Every rejected promise is either a `ZepError` (the API responded with a
non-2xx status) or the underlying `fetch` error (network failure, abort,
etc). Narrow with `isZepError`, or the reason-specific helpers:

```ts
import { isNotFound, isForbidden } from "zep-sdk";

try {
  await client.thread.getSummary("thread-1");
} catch (err) {
  if (isNotFound(err)) {
    // no summary yet
  } else if (isForbidden(err)) {
    // plan upgrade required
  } else {
    throw err;
  }
}
```

`ZepError` also exposes `.reason` (one of `"bad_request"`, `"unauthorized"`,
`"forbidden"`, `"not_found"`, `"conflict"`, `"unprocessable_entity"`,
`"rate_limited"`, `"internal_server_error"`, `"service_unavailable"`,
`"unknown"`), `.status`, `.body`, and `.requestId`. 429 and 5xx responses
are retried automatically with exponential backoff (`maxRetries`, default
2); 4xx errors are not retried.

## Batch ingestion

The Batch API is a three-step lifecycle — create an empty batch, add up to
500 items per call (up to 50,000 per batch), then start processing:

```ts
const batch = await client.batch.create({ metadata: { description: "Support backfill" } });

await client.batch.add(batch.batchId, [
  { type: "graph_episode", userId: "alice", data: "Alice upgraded to Pro.", dataType: "text" },
  {
    type: "thread_message",
    threadId: "alice-support-42",
    content: "Dashboard won't load.",
    role: "user",
    name: "Alice",
  },
]);

await client.batch.process(batch.batchId);
const final = await client.batch.await(batch.batchId);
```

`client.graph.addBatch` remains fine for small (≤20 episodes), same-graph,
order-independent batches. For everything larger, or batches mixing
thread messages and graph episodes across multiple targets, use
`client.batch`. For batches with thousands of items, prefer subscribing
to the `ingest.batch.completed` webhook over polling `await`.
`client.thread.addMessagesBatch` is deprecated in favor of `client.batch`.

## Webhooks

Zep signs webhook deliveries via Svix (HMAC-SHA256), verified here using
the Web Crypto API — no `node:crypto` import, so this works isomorphically.
Endpoint management (creating/rotating endpoints) happens in the Zep
dashboard; `verifyWebhook` verifies deliveries your server receives:

```ts
import { verifyWebhook, ZepWebhookVerificationError } from "zep-sdk";

// Read the RAW body - many frameworks parse JSON before your handler
// runs, which breaks verification.
const rawBody = await request.text();

try {
  await verifyWebhook(
    rawBody,
    {
      svixId: request.headers.get("svix-id") ?? "",
      svixTimestamp: request.headers.get("svix-timestamp") ?? "",
      svixSignature: request.headers.get("svix-signature") ?? "",
    },
    signingSecret,
  );
} catch (err) {
  if (err instanceof ZepWebhookVerificationError) {
    return new Response("invalid signature", { status: 400 });
  }
  throw err;
}

const event = JSON.parse(rawBody);
```

## Graph scoping

Every graph operation is scoped to exactly one of a user's graph or a
standalone graph, via `userScope`/`graphIdScope`:

```ts
import { userScope, graphIdScope } from "zep-sdk";

await client.graph.add("text", "Ada loves math.", { scope: userScope("user-1") });
await client.graph.add("text", "Company policy update.", { scope: graphIdScope("company-docs") });
```

Passing neither or both throws `ZepInvalidArgumentError` synchronously,
before any HTTP request is made.

## Development

```
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run build
```
