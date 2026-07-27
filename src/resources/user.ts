import type { ResolvedZepConfig } from "../config.js";
import { request } from "../http.js";
import { paginate } from "../pagination.js";
import { arrayOf, asRaw, bool, num, recordOpt, str, strOpt, type Raw } from "../internal/raw.js";
import { mapThread, type Thread } from "./thread.js";

/**
 * A Zep user - the identity that threads and graph memory attach to.
 * Facts and entities extracted from any of a user's threads are merged
 * into a single user-level knowledge graph.
 */
export interface User {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  metadata?: Record<string, unknown>;
  disableDefaultOntology?: boolean;
  createdAt?: string;
  deletedAt?: string;
}

function mapUser(raw: Raw): User {
  return {
    userId: str(raw, "user_id"),
    email: strOpt(raw, "email"),
    firstName: strOpt(raw, "first_name"),
    lastName: strOpt(raw, "last_name"),
    metadata: recordOpt(raw, "metadata"),
    disableDefaultOntology: bool(raw, "disable_default_ontology"),
    createdAt: strOpt(raw, "created_at"),
    deletedAt: strOpt(raw, "deleted_at"),
  };
}

/** Paginated envelope returned by {@link UserResource.listOrdered}. */
export interface UserList {
  users: User[];
  responseCount: number;
  totalCount: number;
}

function mapUserList(raw: Raw): UserList {
  return {
    users: arrayOf(raw, "users", mapUser),
    responseCount: num(raw, "response_count"),
    totalCount: num(raw, "total_count"),
  };
}

export interface AddUserParams {
  email?: string;
  firstName?: string;
  lastName?: string;
  metadata?: Record<string, unknown>;
  disableDefaultOntology?: boolean;
}

export interface UpdateUserParams {
  email?: string;
  firstName?: string;
  lastName?: string;
  metadata?: Record<string, unknown>;
}

export interface ListUsersParams {
  pageNumber?: number;
  pageSize?: number;
  orderBy?: string;
  asc?: boolean;
}

export interface UserInstruction {
  text: string;
}

export interface AddInstructionsParams {
  /**
   * Scopes the instructions to specific users; omit (or leave empty) to
   * add to the project-wide default instructions applied to every user.
   */
  userIds?: string[];
}

/**
 * Users - the identity that threads and graph memory attach to. Access
 * via `client.user`.
 */
export class UserResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /**
   * Adds a user. Providing at least a name significantly improves Zep's
   * ability to associate ingested data (emails, documents, business
   * records) with this user.
   */
  async add(userId: string, params?: AddUserParams): Promise<User> {
    const raw = await request(this.config, {
      method: "POST",
      path: "/api/v2/users",
      body: {
        user_id: userId,
        email: params?.email,
        first_name: params?.firstName,
        last_name: params?.lastName,
        metadata: params?.metadata,
        disable_default_ontology: params?.disableDefaultOntology,
      },
    });
    return mapUser(asRaw(raw));
  }

  /** Fetches a single user by userId. */
  async get(userId: string): Promise<User> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/users/${encodeURIComponent(userId)}`,
    });
    return mapUser(asRaw(raw));
  }

  /** Updates a user's email, first/last name, or metadata. */
  async update(userId: string, params: UpdateUserParams): Promise<User> {
    const raw = await request(this.config, {
      method: "PATCH",
      path: `/api/v2/users/${encodeURIComponent(userId)}`,
      body: {
        email: params.email,
        first_name: params.firstName,
        last_name: params.lastName,
        metadata: params.metadata,
      },
    });
    return mapUser(asRaw(raw));
  }

  /** Deletes a user (and, per Zep's cascade rules, their threads and graph). */
  async delete(userId: string): Promise<void> {
    await request(this.config, {
      method: "DELETE",
      path: `/api/v2/users/${encodeURIComponent(userId)}`,
    });
  }

  /**
   * Lists all users in the project, paginated and ordered. Prefer this
   * over `client.graph.listAll` when you specifically want users rather
   * than standalone/group graphs.
   */
  async listOrdered(params?: ListUsersParams): Promise<UserList> {
    const raw = await request(this.config, {
      method: "GET",
      path: "/api/v2/users-ordered",
      query: {
        page_number: params?.pageNumber,
        page_size: params?.pageSize,
        order_by: params?.orderBy,
        asc: params?.asc,
      },
    });
    return mapUserList(asRaw(raw));
  }

  /** Lazily walks every user in the project across all pages. */
  listAll(params?: ListUsersParams): AsyncGenerator<User> {
    const pageSize = params?.pageSize ?? 25;
    return paginate(pageSize, async (pageNumber, pageSize) => {
      const result = await this.listOrdered({ ...params, pageNumber, pageSize });
      return { items: result.users, totalCount: result.totalCount };
    });
  }

  /**
   * Returns every thread belonging to a user.
   *
   * Unlike `client.thread.list`, this endpoint is not paginated - it
   * returns the full list in one response. If a user may accumulate a
   * very large number of threads, prefer `client.thread.list` (or
   * `listAll`) filtered client-side by user ID.
   */
  async getThreads(userId: string): Promise<Thread[]> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/users/${encodeURIComponent(userId)}/threads`,
    });
    return Array.isArray(raw) ? raw.map((item) => mapThread(asRaw(item))) : [];
  }

  /**
   * Adds new user-graph-summary instructions without removing existing
   * ones.
   */
  async addInstructions(
    instructions: UserInstruction[],
    params?: AddInstructionsParams,
  ): Promise<void> {
    await request(this.config, {
      method: "POST",
      path: "/api/v2/user-summary-instructions",
      body: { instructions, user_ids: params?.userIds },
    });
  }
}
