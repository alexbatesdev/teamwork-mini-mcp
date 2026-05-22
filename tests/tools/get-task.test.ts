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

function fakeClient(overrides: Partial<TeamworkClient>): TeamworkClient {
  return overrides as unknown as TeamworkClient;
}

describe('get_task handler', () => {
  it('calls client.getTask with the provided id', async () => {
    const getTask = vi.fn().mockResolvedValue(rawTask);
    const handler = createGetTaskHandler(fakeClient({ getTask }));

    await handler({ taskId: rawTask.id });

    expect(getTask).toHaveBeenCalledWith(rawTask.id);
  });

  it('returns the slim projection of the task', async () => {
    const getTask = vi.fn().mockResolvedValue(rawTask);
    const handler = createGetTaskHandler(fakeClient({ getTask }));

    const result = await handler({ taskId: rawTask.id });

    expect(result.id).toBe(rawTask.id);
    expect(result.name).toBe(rawTask.name);
    expect(result).not.toHaveProperty('userPermissions');
    expect(result).not.toHaveProperty('workflowStages');
  });
});

describe('getTaskInputSchema', () => {
  it('accepts a positive integer taskId', () => {
    expect(getTaskInputSchema.parse({ taskId: 1 })).toEqual({ taskId: 1 });
  });

  it('rejects non-positive or non-integer taskIds', () => {
    expect(() => getTaskInputSchema.parse({ taskId: 0 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: -5 })).toThrow();
    expect(() => getTaskInputSchema.parse({ taskId: 1.5 })).toThrow();
  });

  it('rejects missing taskId', () => {
    expect(() => getTaskInputSchema.parse({})).toThrow();
  });
});
