import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createListMyTasksHandler,
  listMyTasksInputSchema,
} from '../../src/tools/list-my-tasks.js';
import type { TeamworkClient } from '../../src/teamwork/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawTask = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-task.json'), 'utf-8'),
).task;
const me = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-me.json'), 'utf-8'),
).person;

function fakeClient(overrides: Partial<TeamworkClient>): TeamworkClient {
  return overrides as unknown as TeamworkClient;
}

describe('list_my_tasks handler', () => {
  it('resolves "me" via getCurrentUser and lists tasks assigned to that id', async () => {
    const getCurrentUser = vi.fn().mockResolvedValue(me);
    const listTasksAssignedTo = vi.fn().mockResolvedValue({ tasks: [], users: {} });
    const handler = createListMyTasksHandler(
      fakeClient({ getCurrentUser, listTasksAssignedTo }),
    );

    await handler({});

    expect(getCurrentUser).toHaveBeenCalledOnce();
    expect(listTasksAssignedTo).toHaveBeenCalledWith(me.id, {
      includeCompleted: undefined,
    });
  });

  it('forwards includeCompleted to the client', async () => {
    const getCurrentUser = vi.fn().mockResolvedValue(me);
    const listTasksAssignedTo = vi.fn().mockResolvedValue({ tasks: [], users: {} });
    const handler = createListMyTasksHandler(
      fakeClient({ getCurrentUser, listTasksAssignedTo }),
    );

    await handler({ includeCompleted: true });

    expect(listTasksAssignedTo).toHaveBeenCalledWith(me.id, { includeCompleted: true });
  });

  it('returns a flat array of slim tasks with assignee names resolved', async () => {
    const getCurrentUser = vi.fn().mockResolvedValue(me);
    const listTasksAssignedTo = vi.fn().mockResolvedValue({
      tasks: [rawTask, { ...rawTask, id: 12, name: 'two' }],
      users: { '643631': { id: 643631, firstName: 'Alex', lastName: 'Bates' } },
    });
    const handler = createListMyTasksHandler(
      fakeClient({ getCurrentUser, listTasksAssignedTo }),
    );

    const result = await handler({});

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(rawTask.id);
    expect(result[1]!.id).toBe(12);
    expect(result[0]!.assignees).toEqual([{ id: 643631, name: 'Alex Bates' }]);
    expect(result[0]).not.toHaveProperty('userPermissions');
  });
});

describe('listMyTasksInputSchema', () => {
  it('accepts an empty object', () => {
    expect(listMyTasksInputSchema.parse({})).toEqual({});
  });

  it('accepts includeCompleted as a boolean', () => {
    expect(listMyTasksInputSchema.parse({ includeCompleted: true })).toEqual({
      includeCompleted: true,
    });
  });

  it('rejects a non-boolean includeCompleted', () => {
    expect(() => listMyTasksInputSchema.parse({ includeCompleted: 'yes' })).toThrow();
  });
});
