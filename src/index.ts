/**
 * zep-sdk - a complete TypeScript client for the Zep AI memory API.
 *
 * @packageDocumentation
 */

export { ZepClient, VERSION } from "./client.js";
export type { ZepClientOptions, ResolvedZepConfig } from "./config.js";
export { DEFAULT_BASE_URL, ZepConfigError } from "./config.js";

export {
  ZepError,
  ZepInvalidArgumentError,
  ZepTimeoutError,
  isZepError,
  isNotFound,
  isForbidden,
  isUnauthorized,
  isRateLimited,
  isConflict,
} from "./errors.js";
export type { ErrorReason } from "./errors.js";

export type {
  Thread,
  ThreadList,
  Message,
  MessageList,
  ThreadSummary,
  ThreadContext,
  ListThreadsParams,
  CreateThreadParams,
  GetUserContextParams,
  GetMessagesParams,
  AddMessagesParams,
  AddMessagesResult,
  UpdateMessageParams,
} from "./resources/thread.js";
export { ThreadResource } from "./resources/thread.js";

export type {
  User,
  UserList,
  AddUserParams,
  UpdateUserParams,
  ListUsersParams,
  UserInstruction,
  AddInstructionsParams,
} from "./resources/user.js";
export { UserResource } from "./resources/user.js";

export type { ContextTemplate, UpdateTemplateParams } from "./resources/context.js";
export { ContextResource } from "./resources/context.js";

export type {
  Graph,
  GraphList,
  Episode,
  Edge,
  GraphNode,
  SearchResults,
  GraphScope,
  DataType,
  CreateGraphParams,
  UpdateGraphParams,
  ListGraphsParams,
  AddParams,
  BatchEpisode,
  CloneParams,
  SearchParams,
  ListEdgesParams,
  UpdateEdgeParams,
  ListEpisodesParams,
  EpisodeList,
  ListNodesParams,
  Observation,
  AddObservationParams,
  ListObservationsParams,
  ListThreadSummariesParams,
} from "./resources/graph/index.js";
export {
  GraphResource,
  userScope,
  graphIdScope,
  GraphEdgeResource,
  GraphEpisodeResource,
  GraphNodeResource,
  GraphCustomInstructionsResource,
  GraphObservationsResource,
  GraphThreadSummariesResource,
} from "./resources/graph/index.js";

export type { Project, UpdateProjectParams } from "./resources/project.js";
export { ProjectResource } from "./resources/project.js";

export type { Task, AwaitParams } from "./resources/task.js";
export { TaskResource } from "./resources/task.js";

export type {
  BatchJob,
  BatchProgress,
  BatchItem,
  BatchItemInput,
  CreateBatchParams,
  ListItemsParams,
  ListBatchesParams,
  BatchAwaitParams,
} from "./resources/batch.js";
export { BatchResource } from "./resources/batch.js";

export type { WebhookHeaders, WebhookVerificationFailureReason } from "./resources/webhook.js";
export { verifyWebhook, ZepWebhookVerificationError } from "./resources/webhook.js";
