import { resolveConfig, type ZepClientOptions } from "./config.js";
import { ThreadResource } from "./resources/thread.js";
import { UserResource } from "./resources/user.js";
import { ContextResource } from "./resources/context.js";
import { GraphResource } from "./resources/graph/index.js";
import { ProjectResource } from "./resources/project.js";
import { TaskResource } from "./resources/task.js";
import { BatchResource } from "./resources/batch.js";

/** The current package version, sent as part of the User-Agent header on every request. */
export const VERSION = "1.0.0";

/**
 * A configured client for the Zep AI memory API.
 *
 * Construct one per API key/project and reuse it - it holds no mutable
 * request-scoped state, so a single instance is safe to share across
 * concurrent requests.
 *
 * @example
 * ```ts
 * const client = new ZepClient({ apiKey: "z_..." });
 *
 * const user = await client.user.add("user-1", { firstName: "Ada" });
 * const thread = await client.thread.create("thread-1", "user-1");
 * await client.thread.addMessages("thread-1", [{ role: "user", content: "Hi, I'm Ada." }]);
 * const { context } = await client.thread.getUserContext("thread-1");
 * ```
 */
export class ZepClient {
  readonly thread: ThreadResource;
  readonly user: UserResource;
  readonly context: ContextResource;
  readonly graph: GraphResource;
  readonly project: ProjectResource;
  readonly task: TaskResource;
  readonly batch: BatchResource;

  constructor(options: ZepClientOptions = {}) {
    const config = resolveConfig(options, VERSION);

    this.thread = new ThreadResource(config);
    this.user = new UserResource(config);
    this.context = new ContextResource(config);
    this.graph = new GraphResource(config);
    this.project = new ProjectResource(config);
    this.task = new TaskResource(config);
    this.batch = new BatchResource(config);
  }
}
