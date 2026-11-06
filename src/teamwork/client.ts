import type { RawTeamworkComment } from '../projections/comment.js';
import type { RawTeamworkTask } from '../projections/task.js';
import type { RawTeamworkPerson, RawUsersById } from '../projections/user.js';

export interface TeamworkClientOptions {
  site: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

/** A task plus the users sideloaded with it (for resolving assignee names). */
export interface TaskResult {
  task: RawTeamworkTask;
  users: RawUsersById;
}

/** A list of tasks plus the users sideloaded with them. */
export interface TaskListResult {
  tasks: RawTeamworkTask[];
  users: RawUsersById;
}

/** A task's placement within a workflow (as returned in `task.workflowStages`). */
export interface TaskWorkflowStage {
  /** The stage the task sits in; 0 when it's in the workflow but not yet staged. */
  stageId: number;
  workflowId: number;
}

/** A single workflow stage. */
export interface WorkflowStage {
  id: number;
  name: string;
}

/** Page size used when walking a paged endpoint to exhaustion. */
const FULL_WALK_PAGE_SIZE = 250;

export class TeamworkClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: TeamworkClientOptions) {
    this.baseUrl = `https://${normalizeSite(opts.site)}`;
    this.authHeader = `Basic ${Buffer.from(`${opts.apiKey}:`).toString('base64')}`;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  async getTask(id: number): Promise<TaskResult> {
    const body = await this.get<{
      task: RawTeamworkTask;
      included?: { users?: RawUsersById };
    }>(`/projects/api/v3/tasks/${id}.json?include=users`);
    return { task: body.task, users: body.included?.users ?? {} };
  }

  /**
   * Fetch a task's comments, newest first, capped at `limit`. Returns the
   * fetched page alongside `total` (the full comment count reported by the API)
   * so callers can tell how many were omitted by the cap.
   */
  async getTaskComments(
    id: number,
    opts: { limit?: number } = {},
  ): Promise<{ comments: RawTeamworkComment[]; total: number }> {
    const params = new URLSearchParams({
      pageSize: String(opts.limit ?? 20),
      orderBy: 'date',
      orderMode: 'desc',
    });
    const body = await this.get<{
      comments: RawTeamworkComment[];
      meta?: { page?: { count?: number } };
    }>(`/projects/api/v3/tasks/${id}/comments.json?${params.toString()}`);
    const comments = body.comments ?? [];
    return { comments, total: body.meta?.page?.count ?? comments.length };
  }

  /**
   * Fetch all direct subtasks of a task. The v3 subtasks endpoint is itself
   * paged, so we walk pages (largest page size we use anywhere) until exhausted
   * to return the complete set — callers higher up depend on an accurate count.
   */
  async listSubtasks(id: number): Promise<TaskListResult> {
    return this.getAllTaskPages((page) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(FULL_WALK_PAGE_SIZE),
        include: 'users',
      });
      return `/projects/api/v3/tasks/${id}/subtasks.json?${params.toString()}`;
    });
  }

  async searchTasks(
    query: string,
    opts: { pageSize?: number } = {},
  ): Promise<TaskListResult> {
    const params = new URLSearchParams({
      searchTerm: query,
      pageSize: String(opts.pageSize ?? 25),
      include: 'users',
    });
    const body = await this.get<{
      tasks: RawTeamworkTask[];
      included?: { users?: RawUsersById };
    }>(`/projects/api/v3/tasks.json?${params.toString()}`);
    return { tasks: body.tasks, users: body.included?.users ?? {} };
  }

  /**
   * Fetch every task assigned to `userId`, walking pages until exhausted so
   * the result is the complete flat set. Completed tasks are excluded unless
   * `includeCompleted` is set (matching the API's default).
   */
  async listTasksAssignedTo(
    userId: number,
    opts: { includeCompleted?: boolean } = {},
  ): Promise<TaskListResult> {
    return this.getAllTaskPages((page) => {
      const params = new URLSearchParams({
        // The assignee filter param is responsiblePartyIds — verified against
        // the live API; the documented-sounding assignedToUserIds is silently
        // ignored (matches Teamwork's own twapi-go-sdk).
        responsiblePartyIds: String(userId),
        page: String(page),
        pageSize: String(FULL_WALK_PAGE_SIZE),
        include: 'users',
      });
      if (opts.includeCompleted) params.set('includeCompletedTasks', 'true');
      return `/projects/api/v3/tasks.json?${params.toString()}`;
    });
  }

  /**
   * Walk a paged v3 tasks endpoint until exhausted, concatenating tasks and
   * merging each page's `included.users` sideload — callers higher up depend
   * on an accurate, complete set.
   */
  private async getAllTaskPages(pathForPage: (page: number) => string): Promise<TaskListResult> {
    const all: RawTeamworkTask[] = [];
    const users: RawUsersById = {};
    for (let page = 1; ; page++) {
      const body = await this.get<{
        tasks: RawTeamworkTask[];
        included?: { users?: RawUsersById };
        meta?: { page?: { hasMore?: boolean } };
      }>(pathForPage(page));
      const tasks = body.tasks ?? [];
      all.push(...tasks);
      Object.assign(users, body.included?.users);
      // Stop on an explicit hasMore=false, or when the page wasn't full.
      const hasMore = body.meta?.page?.hasMore;
      if (hasMore === false || tasks.length < FULL_WALK_PAGE_SIZE) break;
    }
    return { tasks: all, users };
  }

  /** Fetch the user the API key authenticates as. */
  async getCurrentUser(): Promise<RawTeamworkPerson> {
    const body = await this.get<{ person: RawTeamworkPerson }>('/projects/api/v3/me.json');
    return body.person;
  }

  /**
   * Fetch just a task's base status and its current workflow placement — the
   * minimum the dev-stage tool needs to decide whether a move is warranted.
   * `stage` is null when the task sits in no workflow.
   */
  async getTaskWorkflowStage(
    id: number,
  ): Promise<{ status: string; stage: TaskWorkflowStage | null }> {
    const body = await this.get<{
      task: { status: string; workflowStages?: TaskWorkflowStage[] };
    }>(`/projects/api/v3/tasks/${id}.json?fields[tasks]=id,status,workflowStages`);
    return { status: body.task.status, stage: body.task.workflowStages?.[0] ?? null };
  }

  /** List a workflow's stages in display order (first stage first). */
  async listWorkflowStages(workflowId: number): Promise<WorkflowStage[]> {
    const body = await this.get<{ stages: WorkflowStage[] }>(
      `/projects/api/v3/workflows/${workflowId}/stages.json?orderBy=displayorder&orderMode=asc`,
    );
    return body.stages ?? [];
  }

  /**
   * Move a task to a workflow stage. One of the server's writes; the
   * API answers 204 No Content on success.
   */
  async moveTaskToWorkflowStage(taskId: number, workflowId: number, stageId: number): Promise<void> {
    await this.sendNoContent(
      'PATCH',
      `/projects/api/v3/tasks/${taskId}/workflows/${workflowId}.json`,
      { stageId },
    );
  }

  /**
   * Create a task in a tasklist, or a subtask under `parentTaskId` (which wins
   * when both are given). Returns the new task's id and its web URL.
   */
  async createTask(input: {
    tasklistId?: number;
    parentTaskId?: number;
    name: string;
    description?: string;
    assigneeUserId?: number;
  }): Promise<{ id: number; url: string }> {
    const task: Record<string, unknown> = { name: input.name };
    if (input.description !== undefined) task.description = input.description;
    if (input.assigneeUserId !== undefined) task.assignees = { userIds: [input.assigneeUserId] };
    const path =
      input.parentTaskId !== undefined
        ? `/projects/api/v3/tasks/${input.parentTaskId}/subtasks.json`
        : `/projects/api/v3/tasklists/${input.tasklistId}/tasks.json`;
    const res = await this.send('POST', path, { task });
    const body = (await res.json().catch(() => ({}))) as {
      task?: { id?: number };
      id?: number;
      affected?: { taskIds?: number[] };
    };
    const id = body.task?.id ?? body.id ?? body.affected?.taskIds?.[0];
    if (typeof id !== 'number') {
      throw new Error(`Teamwork created a task at ${path} but the response carried no task id`);
    }
    return { id, url: `${this.baseUrl}/app/tasks/${id}` };
  }

  private async sendNoContent(method: string, path: string, body: unknown): Promise<void> {
    await this.send(method, path, body);
  }

  private async send(method: string, path: string, body: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`Teamwork request to ${this.baseUrl}${path} failed: ${describeFetchError(err)}`, {
        cause: err,
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Teamwork ${res.status} for ${path}: ${text.slice(0, 200)}`);
    }
    return res;
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      // A rejection here is a network-level failure (DNS, connection refused,
      // TLS, timeout), not an HTTP status. fetch reports these as a generic
      // "fetch failed" and hides the real reason in `cause`, so surface it.
      throw new Error(`Teamwork request to ${this.baseUrl}${path} failed: ${describeFetchError(err)}`, {
        cause: err,
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Teamwork ${res.status} for ${path}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}

/**
 * Build a human-readable reason from a thrown fetch error. Node's fetch wraps
 * the underlying network error as `cause`; that's where the actionable detail
 * lives (e.g. ENOTFOUND for a bad site, ECONNREFUSED/EPERM/ETIMEDOUT for a
 * firewall blocking the connect, certificate errors).
 *
 * When the host resolves to several IPs (e.g. a Cloudflare-fronted domain) and
 * every connection attempt fails, `cause` is an AggregateError whose own
 * message is empty — the per-IP reasons sit in `cause.errors`. We surface those
 * so a sandbox/firewall block reads as "connect EPERM <ip>:443" rather than a
 * bare "fetch failed".
 */
function describeFetchError(err: unknown): string {
  const cause = (err as { cause?: unknown })?.cause;
  const reason = describeReason(cause) || describeReason(err);
  return reason || 'unknown error';
}

function describeReason(value: unknown): string {
  if (value == null) return '';

  // AggregateError (or any error carrying nested errors): describe each one.
  // De-duplicate because multi-IP failures are usually the same code repeated.
  const nested = (value as { errors?: unknown })?.errors;
  if (Array.isArray(nested) && nested.length > 0) {
    const seen = new Set<string>();
    for (const e of nested) {
      const d = describeReason(e);
      if (d) seen.add(d);
    }
    if (seen.size > 0) return [...seen].join('; ');
  }

  const parts: string[] = [];
  const code = (value as { code?: unknown })?.code;
  if (typeof code === 'string' && code) parts.push(code);
  const message = (value as { message?: unknown })?.message;
  if (typeof message === 'string' && message) parts.push(message);
  return parts.join(': ');
}

function normalizeSite(site: string): string {
  return site.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
