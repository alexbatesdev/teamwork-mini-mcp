import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createListSubtasksHandler,
  listSubtasksInputSchema,
} from '../../src/tools/list-subtasks.js';
import type { TeamworkClient } from '../../src/teamwork/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawTask = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-task.json'), 'utf-8'),
).task;

function fakeClient(overrides: Partial<TeamworkClient>): TeamworkClient {
  return overrides as unknown as TeamworkClient;
}

describe('list_subtasks handler', () => {
  it('calls client.listSubtasks with the provided id', async () => {
    const listSubtasks = vi.fn().mockResolvedValue([]);
    const handler = createListSubtasksHandler(fakeClient({ listSubtasks }));

    await handler({ taskId: 42 });

    expect(listSubtasks).toHaveBeenCalledWith(42);
  });

  it('returns the empty array when there are no subtasks', async () => {
    const listSubtasks = vi.fn().mockResolvedValue([]);
    const handler = createListSubtasksHandler(fakeClient({ listSubtasks }));

    const result = await handler({ taskId: 42 });

    expect(result).toEqual([]);
  });

  it('projects each subtask to the slim shape', async () => {
    const listSubtasks = vi
      .fn()
      .mockResolvedValue([rawTask, { ...rawTask, id: 999, name: 'second' }]);
    const handler = createListSubtasksHandler(fakeClient({ listSubtasks }));

    const result = await handler({ taskId: 1 });

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(rawTask.id);
    expect(result[1]!.id).toBe(999);
    expect(result[1]!.name).toBe('second');
    expect(result[0]).not.toHaveProperty('userPermissions');
  });
});

describe('listSubtasksInputSchema', () => {
  it('accepts a positive integer taskId', () => {
    expect(listSubtasksInputSchema.parse({ taskId: 1 })).toEqual({ taskId: 1 });
  });

  it('rejects non-positive taskIds', () => {
    expect(() => listSubtasksInputSchema.parse({ taskId: 0 })).toThrow();
  });
});
