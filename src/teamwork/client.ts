import type { RawTeamworkComment } from '../projections/comment.js';
import type { RawTeamworkTask } from '../projections/task.js';
import type { RawTeamworkPerson } from '../projections/user.js';

export interface TeamworkClientOptions {
  site: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

export class TeamworkClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: TeamworkClientOptions) {
    this.baseUrl = `https://${normalizeSite(opts.site)}`;
    this.authHeader = `Basic ${Buffer.from(`${opts.apiKey}:`).toString('base64')}`;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  async getTask(id: number): Promise<RawTeamworkTask> {
    const body = await this.get<{ task: RawTeamworkTask }>(`/projects/api/v3/tasks/${id}.json`);
    return body.task;
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
  async listSubtasks(id: number): Promise<RawTeamworkTask[]> {
    const pageSize = 250;
    const all: RawTeamworkTask[] = [];
    for (let page = 1; ; page++) {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const body = await this.get<{
        tasks: RawTeamworkTask[];
        meta?: { page?: { hasMore?: boolean } };
      }>(`/projects/api/v3/tasks/${id}/subtasks.json?${params.toString()}`);
      const tasks = body.tasks ?? [];
      all.push(...tasks);
      // Stop on an explicit hasMore=false, or when the page wasn't full.
      const hasMore = body.meta?.page?.hasMore;
      if (hasMore === false || tasks.length < pageSize) break;
    }
    return all;
  }

  async searchTasks(
    query: string,
    opts: { pageSize?: number } = {},
  ): Promise<RawTeamworkTask[]> {
    const params = new URLSearchParams({
      searchTerm: query,
      pageSize: String(opts.pageSize ?? 25),
    });
    const body = await this.get<{ tasks: RawTeamworkTask[] }>(
      `/projects/api/v3/tasks.json?${params.toString()}`,
    );
    return body.tasks;
  }

  /** Fetch the user the API key authenticates as. */
  async getCurrentUser(): Promise<RawTeamworkPerson> {
    const body = await this.get<{ person: RawTeamworkPerson }>('/projects/api/v3/me.json');
    return body.person;
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
