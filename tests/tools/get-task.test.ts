import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGetTaskHandler, getTaskInputSchema } from '../../src/tools/get-task.js';
import type { TeamworkClient } from '../../src/teamwork/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawTask = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-task.json'), 'utf-8'),
).task;
const commentsFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-comments.json'), 'utf-8'),
);

function fakeClient(overrides: Partial<TeamworkClient>): TeamworkClient {
  // Default listSubtasks to an empty list so tests that don't care about
  // subtasks still exercise the (depth=1) traversal without extra setup.
  return { listSubtasks: async () => [], ...overrides } as unknown as TeamworkClient;
}

function commentsResult() {
  return {
    comments: commentsFixture.comments,
    total: commentsFixture.meta.page.count,
  };
}

describe('get_task handler', () => {
  it('calls client.getTask and getTaskComments with the provided id', async () => {
    const getTask = vi.fn().mockResolvedValue(rawTask);
    const getTaskComments = vi.fn().mockResolvedValue(commentsResult());
    const handler = createGetTaskHandler(fakeClient({ getTask, getTaskComments }));

    await handler({ taskId: rawTask.id });

    expect(getTask).toHaveBeenCalledWith(rawTask.id);
    expect(getTaskComments).toHaveBeenCalledWith(rawTask.id, { limit: 20 });
  });

  it('passes a custom commentLimit through to the client', async () => {
    const getTask = vi.fn().mockResolvedValue(rawTask);
    const getTaskComments = vi.fn().mockResolvedValue(commentsResult());
    const handler = createGetTaskHandler(fakeClient({ getTask, getTaskComments }));

    await handler({ taskId: rawTask.id, commentLimit: 100 });

    expect(getTaskComments).toHaveBeenCalledWith(rawTask.id, { limit: 100 });
  });

  it('returns the slim projection of the task', async () => {
    const getTask = vi.fn().mockResolvedValue(rawTask);
    const getTaskComments = vi.fn().mockResolvedValue(commentsResult());
    const handler = createGetTaskHandler(fakeClient({ getTask, getTaskComments }));

    const result = await handler({ taskId: rawTask.id });

    expect(result.id).toBe(rawTask.id);
    expect(result.name).toBe(rawTask.name);
    expect(result).not.toHaveProperty('userPermissions');
    expect(result).not.toHaveProperty('workflowStages');
  });

  it('includes comments in chronological order with the omitted count', async () => {
    const getTask = vi.fn().mockResolvedValue(rawTask);
    const getTaskComments = vi.fn().mockResolvedValue(commentsResult());
    const handler = createGetTaskHandler(fakeClient({ getTask, getTaskComments }));

    const result = await handler({ taskId: rawTask.id });

    expect(result.comments.map((c) => c.id)).toEqual([9001, 9002]);
    // 7 total reported, 2 returned -> 5 omitted by the cap.
    expect(result.omittedCommentCount).toBe(5);
  });

  it('reports zero omitted comments when all are returned', async () => {
    const getTask = vi.fn().mockResolvedValue(rawTask);
    const getTaskComments = vi
      .fn()
      .mockResolvedValue({ comments: commentsFixture.comments, total: 2 });
    const handler = createGetTaskHandler(fakeClient({ getTask, getTaskComments }));

    const result = await handler({ taskId: rawTask.id });

    expect(result.omittedCommentCount).toBe(0);
  });
});

describe('get_task subtask traversal', () => {
  const rootTask = { ...rawTask, id: 10 };
  const sub = (id: number, parentTaskId: number) => ({
    ...rawTask,
    id,
    parentTaskId,
  });

  function subtaskClient(tree: Record<number, ReturnType<typeof sub>[]>) {
    const getTask = vi.fn().mockResolvedValue(rootTask);
    const getTaskComments = vi.fn().mockResolvedValue(commentsResult());
    const listSubtasks = vi.fn(async (id: number) => tree[id] ?? []);
    return {
      handler: createGetTaskHandler(fakeClient({ getTask, getTaskComments, listSubtasks })),
      listSubtasks,
    };
  }

  it('defaults to depth 1: returns only direct subtasks', async () => {
    const { handler, listSubtasks } = subtaskClient({
      10: [sub(11, 10), sub(12, 10)],
      11: [sub(21, 11)],
    });

    const result = await handler({ taskId: 10 });

    expect(result.subtasks.map((s) => s.id)).toEqual([11, 12]);
    expect(result.subtasks.every((s) => s.depth === 1)).toBe(true);
    expect(result.subtaskPage.depth).toBe(1);
    // Only the root is expanded at depth 1.
    expect(listSubtasks).toHaveBeenCalledTimes(1);
    expect(listSubtasks).toHaveBeenCalledWith(10);
  });

  it('walks deeper levels in breadth-first order, tagging each with its depth', async () => {
    const { handler } = subtaskClient({
      10: [sub(11, 10), sub(12, 10)],
      11: [sub(21, 11)],
      12: [sub(22, 12)],
    });

    const result = await handler({ taskId: 10, subtaskDepth: 2 });

    // Parents (depth 1) before children (depth 2).
    expect(result.subtasks.map((s) => s.id)).toEqual([11, 12, 21, 22]);
    expect(result.subtasks.map((s) => s.depth)).toEqual([1, 1, 2, 2]);
    expect(result.subtaskPage.total).toBe(4);
  });

  it('makes no subtask calls when subtaskDepth is 0', async () => {
    const { handler, listSubtasks } = subtaskClient({ 10: [sub(11, 10)] });

    const result = await handler({ taskId: 10, subtaskDepth: 0 });

    expect(result.subtasks).toEqual([]);
    expect(result.subtaskPage).toMatchObject({ depth: 0, total: 0, returned: 0, hasMore: false });
    expect(listSubtasks).not.toHaveBeenCalled();
  });

  it('paginates the flattened subtask list', async () => {
    const { handler } = subtaskClient({
      10: Array.from({ length: 5 }, (_, i) => sub(100 + i, 10)),
    });

    const page1 = await handler({ taskId: 10, subtaskPageSize: 2, subtaskPage: 1 });
    expect(page1.subtasks.map((s) => s.id)).toEqual([100, 101]);
    expect(page1.subtaskPage).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 5,
      returned: 2,
      hasMore: true,
    });

    const page3 = await handler({ taskId: 10, subtaskPageSize: 2, subtaskPage: 3 });
    expect(page3.subtasks.map((s) => s.id)).toEqual([104]);
    expect(page3.subtaskPage).toMatchObject({ returned: 1, hasMore: false });
  });

  it('guards against cycles so a self-referential subtask is not fetched twice', async () => {
    const { handler, listSubtasks } = subtaskClient({
      10: [sub(11, 10)],
      11: [sub(10, 11)], // points back at the root
    });

    const result = await handler({ taskId: 10, subtaskDepth: 3 });

    expect(result.subtasks.map((s) => s.id)).toEqual([11]);
    // Root (10) fetched once as the start, 11 fetched once; the back-reference
    // to 10 is skipped rather than refetched.
    expect(listSubtasks).toHaveBeenCalledTimes(2);
    expect(listSubtasks.mock.calls.map((c) => c[0])).toEqual([10, 11]);
  });
});

describe('getTaskInputSchema', () => {
  it('accepts a positive integer taskId', () => {
    expect(getTaskInputSchema.parse({ taskId: 1 })).toEqual({ taskId: 1 });
  });

  it('accepts an optional commentLimit', () => {
    expect(getTaskInputSchema.parse({ taskId: 1, commentLimit: 50 })).toEqual({
      taskId: 1,
      commentLimit: 50,
    });
  });

  it('rejects non-positive or non-integer taskIds', () => {
    expect(() => getTaskInputSchema.parse({ taskId: 0 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: -5 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: 1.5 })).toThrow();
  });

  it('rejects an out-of-range or non-integer commentLimit', () => {
    expect(() => getTaskInputSchema.parse({ taskId: 1, commentLimit: 0 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: 1, commentLimit: 201 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: 1, commentLimit: 2.5 })).toThrow();
  });

  it('accepts subtask params and allows a depth of 0', () => {
    expect(
      getTaskInputSchema.parse({ taskId: 1, subtaskDepth: 0, subtaskPage: 2, subtaskPageSize: 100 }),
    ).toEqual({ taskId: 1, subtaskDepth: 0, subtaskPage: 2, subtaskPageSize: 100 });
  });

  it('rejects out-of-range subtask params', () => {
    expect(() => getTaskInputSchema.parse({ taskId: 1, subtaskDepth: -1 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: 1, subtaskDepth: 6 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: 1, subtaskPage: 0 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: 1, subtaskPageSize: 0 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: 1, subtaskPageSize: 201 })).toThrow();
  });

  it('rejects missing taskId', () => {
    expect(() => getTaskInputSchema.parse({})).toThrow();
  });
});
