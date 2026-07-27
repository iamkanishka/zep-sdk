import type { ResolvedZepConfig } from "../config.js";
import { ZepInvalidArgumentError, ZepTimeoutError } from "../errors.js";
import { request } from "../http.js";
import { arrayOf, asRaw, num, recordOpt, str, strOpt, type Raw } from "../internal/raw.js";
import { sleep } from "../internal/sleep.js";

/** Item-count progress for a batch job, nested in {@link BatchJob}. */
export interface BatchProgress {
  totalItems: number;
  queuedItems: number;
  processingItems: number;
  succeededItems: number;
  failedItems: number;
  skippedItems: number;
  percentComplete: number;
}

function mapBatchProgress(raw: Raw | undefined): BatchProgress {
  const r = raw ?? {};
  return {
    totalItems: num(r, "total_items"),
    queuedItems: num(r, "queued_items"),
    processingItems: num(r, "processing_items"),
    succeededItems: num(r, "succeeded_items"),
    failedItems: num(r, "failed_items"),
    skippedItems: num(r, "skipped_items"),
    percentComplete: num(r, "percent_complete"),
  };
}

/**
 * A batch ingestion job, as created/listed via `client.batch`.
 *
 * `status` is one of "draft" (before {@link BatchResource.process} is
 * called), "queued", "processing", or one of the terminal statuses
 * "succeeded", "partial", "failed", "invalid".
 */
export interface BatchJob {
  batchId: string;
  status: string;
  metadata?: Record<string, unknown>;
  progress: BatchProgress;
  createdAt?: string;
  updatedAt?: string;
}

function mapBatchJob(raw: Raw): BatchJob {
  return {
    batchId: str(raw, "batch_id") || str(raw, "uuid"),
    status: str(raw, "status"),
    metadata: recordOpt(raw, "metadata"),
    progress: mapBatchProgress(recordOpt(raw, "progress")),
    createdAt: strOpt(raw, "created_at"),
    updatedAt: strOpt(raw, "updated_at"),
  };
}

/**
 * A single item within a batch, as returned by {@link BatchResource.listItems}.
 *
 * `status` is one of "pending", "queued", "processing", "succeeded",
 * "failed", "skipped".
 */
export interface BatchItem {
  itemId: string;
  type: string;
  status: string;
  error?: string;
}

function mapBatchItem(raw: Raw): BatchItem {
  return {
    itemId: str(raw, "item_id") || str(raw, "uuid"),
    type: str(raw, "type"),
    status: str(raw, "status"),
    error: strOpt(raw, "error"),
  };
}

/**
 * An item to add to a batch via {@link BatchResource.add}.
 *
 * For type "graph_episode": set userId or graphId, data, and dataType.
 * For type "thread_message": set threadId, content, role, and optionally name.
 */
export interface BatchItemInput {
  type: "graph_episode" | "thread_message";
  userId?: string;
  graphId?: string;
  threadId?: string;
  data?: unknown;
  dataType?: "text" | "json" | "message";
  content?: string;
  role?: string;
  name?: string;
  createdAt?: string;
}

function batchItemToWire(item: BatchItemInput): Record<string, unknown> {
  return {
    type: item.type,
    user_id: item.userId,
    graph_id: item.graphId,
    thread_id: item.threadId,
    data: item.data,
    data_type: item.dataType,
    content: item.content,
    role: item.role,
    name: item.name,
    created_at: item.createdAt,
  };
}

const MAX_BATCH_ADD_ITEMS = 500;
const TERMINAL_BATCH_STATUSES = new Set(["succeeded", "partial", "failed", "invalid"]);

export interface CreateBatchParams {
  metadata?: Record<string, unknown>;
}

export interface ListItemsParams {
  status?: string;
  limit?: number;
  cursor?: string;
}

export interface ListBatchesParams {
  status?: string;
}

export interface BatchAwaitParams {
  /** Delay between polls, in milliseconds. Default 5000. */
  pollIntervalMs?: number;
  /** Overall budget before giving up, in milliseconds. Default 300000 (5m). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * The Batch API - the recommended way to load large historical datasets
 * (backfills, document collections, archived conversations, migrations)
 * into Context Graphs. Access via `client.batch`.
 *
 * A batch follows a three-step lifecycle:
 *
 * ```ts
 * const batch = await client.batch.create();
 * await client.batch.add(batch.batchId, [...]);
 * await client.batch.process(batch.batchId);
 * const final = await client.batch.await(batch.batchId);
 * ```
 *
 * A single batch holds up to 50,000 items total; each `add` call accepts
 * up to 500 items (call it repeatedly against the same batch ID to load
 * more before calling `process`). For batches with thousands of items,
 * prefer subscribing to the `ingest.batch.completed` webhook over polling
 * `await` - see {@link verifyWebhook}.
 */
export class BatchResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Creates a new, empty draft batch. Add items to it with `add`. */
  async create(params?: CreateBatchParams): Promise<BatchJob> {
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/batch",
      body: { metadata: params?.metadata },
    });
    return mapBatchJob(asRaw(raw));
  }

  /**
   * Adds up to 500 items to an existing (draft) batch. Call this
   * repeatedly against the same batchId to load more than 500 items
   * before calling `process`.
   */
  async add(batchId: string, items: BatchItemInput[]): Promise<void> {
    if (items.length > MAX_BATCH_ADD_ITEMS) {
      throw new ZepInvalidArgumentError(
        `add accepts at most ${MAX_BATCH_ADD_ITEMS} items per call, got ${items.length}`,
      );
    }

    await request(this.config, {
      method: "POST",
      path: `/api/v2/batch/${encodeURIComponent(batchId)}/items`,
      body: { items: items.map(batchItemToWire) },
    });
  }

  /** Starts asynchronous processing of a batch. Zep returns immediately. */
  async process(batchId: string): Promise<void> {
    await request(this.config, {
      method: "POST",
      path: `/api/v2/batch/${encodeURIComponent(batchId)}/process`,
    });
  }

  /**
   * Fetches a batch's summary: top-level status plus nested progress with
   * totalItems / succeededItems / failedItems / etc.
   */
  async get(batchId: string): Promise<BatchJob> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/batch/${encodeURIComponent(batchId)}`,
    });
    return mapBatchJob(asRaw(raw));
  }

  /**
   * Lists the individual items within a batch, each with its own status
   * and error message when applicable.
   */
  async listItems(batchId: string, params?: ListItemsParams): Promise<BatchItem[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/batch/${encodeURIComponent(batchId)}/items`,
      query: { status: params?.status, limit: params?.limit, cursor: params?.cursor },
    });
    return arrayOf(asRaw(raw), "items", mapBatchItem);
  }

  /** Lists batch jobs in the project, optionally filtered by status. */
  async list(params?: ListBatchesParams): Promise<BatchJob[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/batch",
      query: { status: params?.status },
    });
    return arrayOf(asRaw(raw), "batches", mapBatchJob);
  }

  /** Deletes a batch. Only batches that haven't been processed yet ("draft") can be deleted. */
  async delete(batchId: string): Promise<void> {
    await request(this.config, {
      method: "DELETE",
      path: `/api/v2/batch/${encodeURIComponent(batchId)}`,
    });
  }

  /**
   * Polls `get` until the batch reaches a terminal status ("succeeded",
   * "partial", "failed", "invalid"), or the deadline elapses.
   *
   * Default poll interval is 5s, default timeout is 5m, matching the "a
   * few seconds" guidance in the Batch Ingestion guide for small batches
   * - for large batches prefer the `ingest.batch.completed` webhook
   * instead of polling.
   *
   * @throws {ZepTimeoutError} if the deadline elapses first.
   */
  async await(batchId: string, params?: BatchAwaitParams): Promise<BatchJob> {
    const interval = params?.pollIntervalMs ?? 5_000;
    const timeout = params?.timeoutMs ?? 300_000;
    const deadline = Date.now() + timeout;

    for (;;) {
      const job = await this.get(batchId);
      if (TERMINAL_BATCH_STATUSES.has(job.status)) return job;
      if (Date.now() >= deadline) throw new ZepTimeoutError();
      await sleep(interval, params?.signal);
    }
  }
}
