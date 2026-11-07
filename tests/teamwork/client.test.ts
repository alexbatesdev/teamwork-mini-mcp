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

  it('GETs the task endpoint with a users sideload and returns the task and users', async () => {
    const fetchFn = mockFetch({
      task: { id: 42, name: 'hi' },
      included: { users: { '7': { id: 7, firstName: 'A', lastName: 'B' } } },
    });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.getTask(42);

    expect(result).toEqual({
      task: { id: 42, name: 'hi' },
      users: { '7': { id: 7, firstName: 'A', lastName: 'B' } },
    });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks/42.json?include=users',
    );
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('getTask returns an empty users map when the response has no sideload', async () => {
    const fetchFn = mockFetch({ task: { id: 42 } });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.getTask(42);

    expect(result).toEqual({ task: { id: 42 }, users: {} });
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
    expect(url).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks/1.json?include=users',
    );
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

  it('surfaces the underlying reason when fetch fails at the network level', async () => {
    // Mirror what Node's fetch throws: a generic "fetch failed" with the real
    // reason tucked into `cause`.
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND example.teamwork.com'), {
      code: 'ENOTFOUND',
    });
    const fetchFn = vi.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause }),
    );
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    await expect(client.getTask(1)).rejects.toThrow(/ENOTFOUND/);
    await expect(client.getTask(1)).rejects.toThrow(
      /example\.teamwork\.com\/projects\/api\/v3\/tasks\/1\.json/,
    );
  });

  it('unpacks per-IP reasons from an AggregateError (multi-IP firewall block)', async () => {
    // A Cloudflare-fronted host resolves to several IPs; when a sandbox firewall
    // blocks every connect, Node's fetch throws "fetch failed" whose cause is an
    // AggregateError with an EMPTY message — the real reasons live in `errors`.
    const cause = Object.assign(new AggregateError([
      Object.assign(new Error('connect EPERM 104.16.0.1:443'), { code: 'EPERM' }),
      Object.assign(new Error('connect EPERM 104.16.0.2:443'), { code: 'EPERM' }),
    ]), { message: '' });
    const fetchFn = vi.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause }),
    );
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    // The bare "fetch failed" must NOT be all the caller sees.
    const err = await client.getTask(1).catch((e: Error) => e);
    expect(err.message).toMatch(/EPERM/);
    expect(err.message).toMatch(/104\.16\.0\.1:443/);
    expect(err.message).not.toBe('fetch failed');
  });

  it('GETs the subtasks endpoint with a users sideload and returns tasks and users', async () => {
    const fetchFn = mockFetch({
      tasks: [{ id: 2 }, { id: 3 }],
      included: { users: { '7': { id: 7, firstName: 'A', lastName: 'B' } } },
      meta: {},
    });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.listSubtasks(1);

    expect(result.tasks).toEqual([{ id: 2 }, { id: 3 }]);
    expect(result.users).toEqual({ '7': { id: 7, firstName: 'A', lastName: 'B' } });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url] = fetchFn.mock.calls[0]!;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks/1/subtasks.json',
    );
    expect(u.searchParams.get('page')).toBe('1');
    expect(u.searchParams.get('include')).toBe('users');
  });

  it('listSubtasks walks pages until a page comes back short, concatenating tasks and merging users', async () => {
    const fullPage = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tasks: fullPage,
            included: { users: { '1': { id: 1, firstName: 'A', lastName: 'A' } } },
            meta: { page: { hasMore: true } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tasks: [{ id: 251 }],
            included: { users: { '2': { id: 2, firstName: 'B', lastName: 'B' } } },
            meta: { page: { hasMore: false } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.listSubtasks(1);

    expect(result.tasks).toHaveLength(251);
    expect(result.tasks[250]).toEqual({ id: 251 });
    expect(Object.keys(result.users).sort()).toEqual(['1', '2']);
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

  it('searchTasks GETs the tasks list with searchTerm and a users sideload', async () => {
    const fetchFn = mockFetch({
      tasks: [{ id: 7 }],
      included: { users: { '7': { id: 7, firstName: 'A', lastName: 'B' } } },
      meta: {},
    });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.searchTasks('amplitude');

    expect(result.tasks).toEqual([{ id: 7 }]);
    expect(result.users).toEqual({ '7': { id: 7, firstName: 'A', lastName: 'B' } });
    const [url] = fetchFn.mock.calls[0]!;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks.json',
    );
    expect(u.searchParams.get('searchTerm')).toBe('amplitude');
    expect(u.searchParams.get('include')).toBe('users');
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

  it('listTasksAssignedTo GETs the tasks list filtered by responsiblePartyIds, open tasks only by default', async () => {
    const fetchFn = mockFetch({ tasks: [{ id: 5 }], meta: { page: { hasMore: false } } });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.listTasksAssignedTo(643631);

    expect(result).toEqual({ tasks: [{ id: 5 }], users: {} });
    const [url] = fetchFn.mock.calls[0]!;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks.json',
    );
    expect(u.searchParams.get('responsiblePartyIds')).toBe('643631');
    expect(u.searchParams.get('include')).toBe('users');
    expect(u.searchParams.get('includeCompletedTasks')).toBeNull();
  });

  it('listTasksAssignedTo requests completed tasks when includeCompleted is set', async () => {
    const fetchFn = mockFetch({ tasks: [], meta: { page: { hasMore: false } } });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    await client.listTasksAssignedTo(643631, { includeCompleted: true });

    const [url] = fetchFn.mock.calls[0]!;
    expect(new URL(url).searchParams.get('includeCompletedTasks')).toBe('true');
  });

  it('listTasksAssignedTo walks all pages into one flat array', async () => {
    const fullPage = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tasks: fullPage, meta: { page: { hasMore: true } } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tasks: [{ id: 251 }], meta: { page: { hasMore: false } } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const result = await client.listTasksAssignedTo(1);

    expect(result.tasks).toHaveLength(251);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(fetchFn.mock.calls[1]![0]);
    expect(secondUrl.searchParams.get('page')).toBe('2');
    expect(secondUrl.searchParams.get('responsiblePartyIds')).toBe('1');
  });

  it('getCurrentUser GETs the me endpoint and returns the raw person object', async () => {
    const fetchFn = mockFetch({ person: { id: 643631, firstName: 'Alex' } });
    const client = new TeamworkClient({
      site: 'example.teamwork.com',
      apiKey: 'k',
      fetch: fetchFn,
    });

    const person = await client.getCurrentUser();

    expect(person).toEqual({ id: 643631, firstName: 'Alex' });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://example.teamwork.com/projects/api/v3/me.json');
  });

  it('getTaskWorkflowStage returns the task status and its first workflow stage', async () => {
    const fetchFn = mockFetch({
      task: { id: 42, status: 'new', workflowStages: [{ stageId: 0, workflowId: 53311 }] },
    });
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    const result = await client.getTaskWorkflowStage(42);

    expect(result).toEqual({ status: 'new', stage: { stageId: 0, workflowId: 53311 } });
    const [url] = fetchFn.mock.calls[0]!;
    expect(new URL(url).origin + new URL(url).pathname).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks/42.json',
    );
  });

  it('getTaskWorkflowStage yields a null stage when the task is in no workflow', async () => {
    const fetchFn = mockFetch({ task: { id: 42, status: 'new' } });
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    expect(await client.getTaskWorkflowStage(42)).toEqual({ status: 'new', stage: null });
  });

  it('listWorkflowStages GETs the stages endpoint ordered by display order', async () => {
    const fetchFn = mockFetch({ stages: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] });
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    const stages = await client.listWorkflowStages(53311);

    expect(stages).toEqual([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    const [url] = fetchFn.mock.calls[0]!;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      'https://example.teamwork.com/projects/api/v3/workflows/53311/stages.json',
    );
    expect(u.searchParams.get('orderBy')).toBe('displayorder');
  });

  it('moveTaskToWorkflowStage PATCHes the task workflow endpoint with the stage id and accepts 204', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    await client.moveTaskToWorkflowStage(42, 53311, 200);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://example.teamwork.com/projects/api/v3/tasks/42/workflows/53311.json');
    expect(init.method).toBe('PATCH');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ stageId: 200 });
  });

  it('moveTaskToWorkflowStage throws a useful error on a non-2xx response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 403 }));
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    await expect(client.moveTaskToWorkflowStage(42, 53311, 200)).rejects.toThrow(/403/);
  });

  it('createTask POSTs a task to the tasklist endpoint and returns id and url', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ task: { id: 77 } }), { status: 201 }),
    );
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    const result = await client.createTask({ tasklistId: 5, name: 'N', description: 'D', assigneeUserId: 9 });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://example.teamwork.com/projects/api/v3/tasklists/5/tasks.json');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      task: { name: 'N', description: 'D', assignees: { userIds: [9] } },
    });
    expect(result).toEqual({ id: 77, url: 'https://example.teamwork.com/app/tasks/77' });
  });

  it('createTask uses the subtasks endpoint for a parent task and fails when no id comes back', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    await expect(client.createTask({ parentTaskId: 42, name: 'N' })).rejects.toThrow(/no task id/);
    expect(fetchFn.mock.calls[0]![0]).toBe(
      'https://example.teamwork.com/projects/api/v3/tasks/42/subtasks.json',
    );
  });

  it('createTask includes the response body in the error when no id is found', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"data":{"newId":5}}', { status: 201 }));
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    await expect(client.createTask({ tasklistId: 5, name: 'N' })).rejects.toThrow(/newId/);
  });

  it('createTask falls back to affected.taskIds[0] when the body has no task id', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ affected: { taskIds: [88] } }), { status: 201 }),
    );
    const client = new TeamworkClient({ site: 'example.teamwork.com', apiKey: 'k', fetch: fetchFn });

    expect((await client.createTask({ tasklistId: 5, name: 'N' })).id).toBe(88);
  });
});
