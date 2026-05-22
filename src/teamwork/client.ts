import type { RawTeamworkTask } from '../projections/task.js';

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

  async listSubtasks(id: number): Promise<RawTeamworkTask[]> {
    const body = await this.get<{ tasks: RawTeamworkTask[] }>(
      `/projects/api/v3/tasks/${id}/subtasks.json`,
    );
    return body.tasks;
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

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Teamwork ${res.status} for ${path}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}

function normalizeSite(site: string): string {
  return site.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
