import type { ResolvedZepConfig } from "../config.js";
import { request } from "../http.js";
import { paginate } from "../pagination.js";
import { arrayOf, asRaw, num, recordOpt, str, strOpt, type Raw } from "../internal/raw.js";

/** A Zep thread - a sequence of messages between a user and an assistant. */
export interface Thread {
  threadId: string;
  userId: string;
  uuid: string;
  projectUuid: string;
  createdAt: string;
}

export function mapThread(raw: Raw): Thread {
  return {
    threadId: str(raw, "thread_id"),
    userId: str(raw, "user_id"),
    uuid: str(raw, "uuid"),
    projectUuid: str(raw, "project_uuid"),
    createdAt: str(raw, "created_at"),
  };
}

/** Paginated envelope returned by {@link ThreadResource.list}. */
export interface ThreadList {
  threads: Thread[];
  responseCount: number;
  totalCount: number;
}

function mapThreadList(raw: Raw): ThreadList {
  return {
    threads: arrayOf(raw, "threads", mapThread),
    responseCount: num(raw, "response_count"),
    totalCount: num(raw, "total_count"),
  };
}

/**
 * A single chat message. `role` mirrors common chat-completion roles
 * ("user", "assistant", "system", "function", "tool") and is kept as a
 * plain string rather than a closed union so this client doesn't reject
 * role values Zep adds later.
 */
export interface Message {
  uuid?: string;
  content: string;
  role: string;
  name?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  processed?: boolean;
}

function mapMessage(raw: Raw): Message {
  return {
    uuid: strOpt(raw, "uuid"),
    content: str(raw, "content"),
    role: str(raw, "role"),
    name: strOpt(raw, "name"),
    metadata: recordOpt(raw, "metadata"),
    createdAt: strOpt(raw, "created_at"),
    processed: typeof raw["processed"] === "boolean" ? raw["processed"] : undefined,
  };
}

/** Serializes a {@link Message} to the wire (camelCase to snake_case). */
function messageToWire(message: Message): Record<string, unknown> {
  return {
    uuid: message.uuid,
    content: message.content,
    role: message.role,
    name: message.name,
    metadata: message.metadata,
    created_at: message.createdAt,
    processed: message.processed,
  };
}

/** Paginated envelope returned by {@link ThreadResource.getMessages}. */
export interface MessageList {
  messages: Message[];
  rowCount: number;
  totalCount: number;
  threadCreatedAt: string;
  userId: string;
}

function mapMessageList(raw: Raw): MessageList {
  return {
    messages: arrayOf(raw, "messages", mapMessage),
    rowCount: num(raw, "row_count"),
    totalCount: num(raw, "total_count"),
    threadCreatedAt: str(raw, "thread_created_at"),
    userId: str(raw, "user_id"),
  };
}

/**
 * A thread's incrementally-generated rolling summary.
 *
 * `lastSummarizedAt` is the wall-clock timestamp of the most recent
 * summary update (an ingestion-time watermark). `lastSummarizedEpisodeValidAt`
 * is the maximum episode reference time covered by the most recent
 * summary, used for event-time recency questions - these are subtly
 * different and both worth checking depending on what you're asking.
 */
export interface ThreadSummary {
  threadId: string;
  uuid: string;
  summary: string;
  createdAt: string;
  lastSummarizedAt: string;
  lastSummarizedEpisodeValidAt: string;
}

export function mapThreadSummary(raw: Raw): ThreadSummary {
  return {
    threadId: str(raw, "thread_id"),
    uuid: str(raw, "uuid"),
    summary: str(raw, "summary"),
    createdAt: str(raw, "created_at"),
    lastSummarizedAt: str(raw, "last_summarized_at"),
    lastSummarizedEpisodeValidAt: str(raw, "last_summarized_episode_valid_at"),
  };
}

/** The assembled context block returned by {@link ThreadResource.getUserContext}. */
export interface ThreadContext {
  context: string;
}

function mapThreadContext(raw: Raw): ThreadContext {
  return { context: str(raw, "context") };
}

export interface ListThreadsParams {
  pageNumber?: number;
  pageSize?: number;
  orderBy?: "created_at" | "updated_at" | "user_id" | "thread_id";
  asc?: boolean;
}

export interface CreateThreadParams {
  metadata?: Record<string, unknown>;
}

export interface GetUserContextParams {
  /** Render using a custom Context Template (see the Context resource). */
  templateId?: string;
}

export interface GetMessagesParams {
  limit?: number;
  cursor?: number;
  /** If set, returns only the N most recent messages, overriding limit/cursor. */
  lastN?: number;
}

export interface AddMessagesParams {
  /** Roles to keep in the thread but exclude from graph extraction (e.g. ["assistant"]). */
  ignoreRoles?: string[];
  /**
   * If true, returns the context block for the most recent messages in
   * the same call, avoiding a follow-up getUserContext round-trip for
   * latency-sensitive callers.
   */
  returnContext?: boolean;
}

export interface AddMessagesResult {
  context?: string;
}

export interface UpdateMessageParams {
  content?: string;
  role?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

/**
 * Threads - conversation containers tying a sequence of messages to a
 * user. Access via `client.thread`.
 *
 * See the Batch resource for the recommended way to bulk-ingest
 * historical messages (superseding the deprecated
 * {@link ThreadResource.addMessagesBatch}).
 */
export class ThreadResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Lists all threads in the project, paginated. */
  async list(params?: ListThreadsParams): Promise<ThreadList> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/threads",
      query: {
        page_number: params?.pageNumber,
        page_size: params?.pageSize,
        order_by: params?.orderBy,
        asc: params?.asc,
      },
    });
    return mapThreadList(asRaw(raw));
  }

  /**
   * Lazily walks every thread in the project across all pages.
   *
   * ```ts
   * for await (const thread of client.thread.listAll({ pageSize: 100 })) {
   *   // ...
   * }
   * ```
   */
  listAll(params?: ListThreadsParams): AsyncGenerator<Thread> {
    const pageSize = params?.pageSize ?? 25;
    return paginate(pageSize, async (pageNumber, pageSize) => {
      const result = await this.list({ ...params, pageNumber, pageSize });
      return { items: result.threads, totalCount: result.totalCount };
    });
  }

  /** Creates a new thread for the given userId. */
  async create(threadId: string, userId: string, params?: CreateThreadParams): Promise<Thread> {
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/threads",
      body: { thread_id: threadId, user_id: userId, metadata: params?.metadata },
    });
    return mapThread(asRaw(raw));
  }

  /** Deletes a thread by threadId. */
  async delete(threadId: string): Promise<void> {
    await request(this.config, {
      method: "DELETE",
      path: `/api/v2/threads/${encodeURIComponent(threadId)}`,
    });
  }

  /**
   * Returns the most relevant context block from the user's knowledge
   * graph, based on the thread's most recent messages.
   */
  async getUserContext(threadId: string, params?: GetUserContextParams): Promise<ThreadContext> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/threads/${encodeURIComponent(threadId)}/context`,
      query: { template_id: params?.templateId },
    });
    return mapThreadContext(asRaw(raw));
  }

  /** Returns the paginated message history of a thread. */
  async getMessages(threadId: string, params?: GetMessagesParams): Promise<MessageList> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/threads/${encodeURIComponent(threadId)}/messages`,
      query: { limit: params?.limit, cursor: params?.cursor, lastn: params?.lastN },
    });
    return mapMessageList(asRaw(raw));
  }

  /**
   * Adds one or more messages to a thread, feeding them into the user's
   * knowledge graph.
   */
  async addMessages(
    threadId: string,
    messages: Message[],
    params?: AddMessagesParams,
  ): Promise<AddMessagesResult> {
    const raw = await request(this.config, {
      method: "POST",
      path: `/api/v2/threads/${encodeURIComponent(threadId)}/messages`,
      body: {
        messages: messages.map(messageToWire),
        ignore_roles: params?.ignoreRoles,
        return_context: params?.returnContext,
      },
    });
    const r = asRaw(raw);
    return { context: strOpt(r, "context") };
  }

  /**
   * Adds messages concurrently rather than sequentially.
   *
   * @deprecated Use the Batch resource with item type "thread_message"
   * instead. Kept for compatibility with existing integrations only.
   */
  async addMessagesBatch(
    threadId: string,
    messages: Message[],
    ignoreRoles?: string[],
  ): Promise<void> {
    await request(this.config, {
      method: "POST",
      path: `/api/v2/threads/${encodeURIComponent(threadId)}/messages-batch`,
      body: { messages: messages.map(messageToWire), ignore_roles: ignoreRoles },
    });
  }

  /**
   * Returns the thread's incrementally-generated rolling summary.
   *
   * Rejects with a `ZepError` with `reason: "not_found"` if no summary
   * has been generated yet.
   */
  async getSummary(threadId: string): Promise<ThreadSummary> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/threads/${encodeURIComponent(threadId)}/summary`,
    });
    return mapThreadSummary(asRaw(raw));
  }

  /**
   * Updates an existing message's content, role, metadata, or createdAt
   * by its messageUuid. Useful for attaching metadata after the fact
   * (e.g. sentiment analysis results) without re-ingesting the message.
   */
  async updateMessage(messageUuid: string, params: UpdateMessageParams): Promise<Message> {
    const raw = await request(this.config, {
      method: "PATCH",
      path: `/api/v2/messages/${encodeURIComponent(messageUuid)}`,
      body: {
        content: params.content,
        role: params.role,
        metadata: params.metadata,
        created_at: params.createdAt,
      },
    });
    return mapMessage(asRaw(raw));
  }
}
