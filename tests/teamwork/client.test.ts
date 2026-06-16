import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TeamworkClient } from '../../src/teamwork/client.js';

function mockFetch(body: unknown, init: { status?: number } = {}) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('TeamworkClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs the task endpoint and returns the raw task object', async () => {
    const fetchFn = mockFetch({ task: { id: 42, name: 'hi' } });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const task = await client.getTask(42);

    expect(task).toEqual({ id: 42, name: 'hi' });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://example.teamwork.com/projects/api/v3/tasks/42.json');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('sends HTTP Basic auth with the API key as the username', async () => {
    const fetchFn = mockFetch({ task: { id: 1 } });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'secret-key',
      fetch: fetchFn,
    });

    await client.getTask(1);

    const init = fetchFn.mock.calls[0]![1];
    const authHeader: string = init.headers.Authorization;
    expect(authHeader.startsWith('Basic ')).toBe(true);
    const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf-8');
    expect(decoded).toBe('secret-key:');
  });

  it('normalizes site with protocol or trailing slash', async () => {
    const fetchFn = mockFetch({ task: { id: 1 } });
    const client = new TeamworkClient({
      site: 'https://example.teamwork.com/',
      apiKey: 'k',
      fetch: fetchFn,
    });

    await client.getTask(1);

    const [url] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://example.teamwork.com/projects/api/v3/tasks/1.json');
  });

  it('throws a useful error on non-2xx responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('Not found', { status: 404 }),
    );
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    await expect(client.getTask(999)).rejects.toThrow(/404/);
  });

  it('GETs the subtasks endpoint and returns the raw tasks array', async () => {
    const fetchFn = mockFetch({ tasks: [{ id: 2 }, { id: 3 }], meta: {} });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const subtasks = await client.listSubtasks(1);

    expect(subtasks).toEqual([{ id: 2 }, { id: 3 }]);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url] = fetchFn.mock.calls[0]!;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks/1/subtasks.json',
    );
    expect(u.searchParams.get('page')).toBe('1');
  });

  it('listSubtasks walks pages until a page comes back short and concatenates them', async () => {
    const fullPage = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tasks: fullPage, meta: { page: { hasMore: true } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tasks: [{ id: 251 }], meta: { page: { hasMore: false } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const subtasks = await client.listSubtasks(1);

    expect(subtasks).toHaveLength(251);
    expect(subtasks[250]).toEqual({ id: 251 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(new URL(fetchFn.mock.calls[1]![0]).searchParams.get('page')).toBe('2');
  });

  it('getTaskComments GETs the comments endpoint newest-first and reports the total', async () => {
    const fetchFn = mockFetch({
      comments: [{ id: 2 }, { id: 1 }],
      meta: { page: { count: 7 } },
    });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.getTaskComments(1, { limit: 5 });

    expect(result).toEqual({ comments: [{ id: 2 }, { id: 1 }], total: 7 });
    const [url] = fetchFn.mock.calls[0]!;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks/1/comments.json',
    );
    expect(u.searchParams.get('pageSize')).toBe('5');
    expect(u.searchParams.get('orderMode')).toBe('desc');
  });

  it('getTaskComments defaults to a limit of 20 and falls back to the page length when no total is given', async () => {
    const fetchFn = mockFetch({ comments: [{ id: 1 }] });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.getTaskComments(1);

    expect(result.total).toBe(1);
    const [url] = fetchFn.mock.calls[0]!;
    expect(new URL(url).searchParams.get('pageSize')).toBe('20');
  });

  it('searchTasks GETs the tasks list with searchTerm', async () => {
    const fetchFn = mockFetch({ tasks: [{ id: 7 }], meta: {} });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const tasks = await client.searchTasks('amplitude');

    expect(tasks).toEqual([{ id: 7 }]);
    const [url] = fetchFn.mock.calls[0]!;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks.json',
    );
    expect(u.searchParams.get('searchTerm')).toBe('amplitude');
  });

  it('searchTasks defaults to a small pageSize', async () => {
    const fetchFn = mockFetch({ tasks: [], meta: {} });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    await client.searchTasks('x');

    const [url] = fetchFn.mock.calls[0]!;
    expect(new URL(url).searchParams.get('pageSize')).toBe('25');
  });

  it('searchTasks allows overriding pageSize', async () => {
    const fetchFn = mockFetch({ tasks: [], meta: {} });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    await client.searchTasks('x', { pageSize: 5 });

    const [url] = fetchFn.mock.calls[0]!;
    expect(new URL(url).searchParams.get('pageSize')).toBe('5');
  });

  it('searchTasks url-encodes terms with special characters', async () => {
    const fetchFn = mockFetch({ tasks: [], meta: {} });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    await client.searchTasks('foo bar & baz');

    const [url] = fetchFn.mock.calls[0]!;
    expect(new URL(url).searchParams.get('searchTerm')).toBe('foo bar & baz');
  });
});
