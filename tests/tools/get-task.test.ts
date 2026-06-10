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
  return overrides as unknown as TeamworkClient;
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

  it('rejects missing taskId', () => {
    expect(() => getTaskInputSchema.parse({})).toThrow();
  });
});
