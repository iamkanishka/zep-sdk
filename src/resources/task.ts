import type { ResolvedZepConfig } from "../config.js";
import { ZepTimeoutError } from "../errors.js";
import { request } from "../http.js";
import { asRaw, str, type Raw } from "../internal/raw.js";
import { sleep } from "../internal/sleep.js";

/** A handle to an asynchronous, long-running Zep operation. */
export interface Task {
  taskId: string;
  status: string;
  createdAt: string;
}

function mapTask(raw: Raw): Task {
  return {
    taskId: str(raw, "task_id") || str(raw, "uuid"),
    status: str(raw, "status"),
    createdAt: str(raw, "created_at"),
  };
}

export interface AwaitParams {
  /** Delay between polls, in milliseconds. Default 1000. */
  pollIntervalMs?: number;
  /** Overall budget before giving up, in milliseconds. Default 60000. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

const TERMINAL_TASK_STATUSES = new Set(["completed", "failed"]);

/**
 * Status polling for asynchronous Zep operations (e.g. bulk ingestion or
 * pattern detection jobs). Access via `client.task`.
 */
export class TaskResource {
  constructor(private readonly config: ResolvedZepConfig) {}

  /** Fetches the current status of a task by taskId. */
  async get(taskId: string): Promise<Task> {
    const raw = await request(this.config, {
      method: "GET",
      path: `/api/v2/tasks/${encodeURIComponent(taskId)}`,
    });
    return mapTask(asRaw(raw));
  }

  /**
   * Polls `get` until the task reaches a terminal status ("completed" or
   * "failed"), or the deadline elapses.
   *
   * @throws {ZepTimeoutError} if the deadline elapses first.
   */
  async await(taskId: string, params?: AwaitParams): Promise<Task> {
    const interval = params?.pollIntervalMs ?? 1_000;
    const timeout = params?.timeoutMs ?? 60_000;
    const deadline = Date.now() + timeout;

    for (;;) {
      const task = await this.get(taskId);
      if (TERMINAL_TASK_STATUSES.has(task.status)) return task;
      if (Date.now() >= deadline) throw new ZepTimeoutError();
      await sleep(interval, params?.signal);
    }
  }
}
