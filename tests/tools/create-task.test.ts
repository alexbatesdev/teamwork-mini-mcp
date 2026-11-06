import { describe, it, expect, vi } from 'vitest';

import { createCreateTaskHandler, createTaskInputSchema } from '../../src/tools/create-task.js';
import type { TeamworkClient } from '../../src/teamwork/client.js';

describe('create_task handler', () => {
  it('passes the input to the client and returns id and url', async () => {
    const createTask = vi.fn().mockResolvedValue({ id: 7, url: 'https://x.teamwork.com/app/tasks/7' });
    const handler = createCreateTaskHandler({ createTask } as unknown as TeamworkClient);

    const result = await handler({ tasklistId: 5, name: 'Follow-up', description: 'd', assigneeUserId: 9 });

    expect(createTask).toHaveBeenCalledWith({ tasklistId: 5, name: 'Follow-up', description: 'd', assigneeUserId: 9 });
    expect(result).toEqual({ id: 7, url: 'https://x.teamwork.com/app/tasks/7' });
  });

  it('requires exactly one of tasklistId or parentTaskId', () => {
    expect(createTaskInputSchema.safeParse({ name: 'n' }).success).toBe(false);
    expect(createTaskInputSchema.safeParse({ name: 'n', tasklistId: 1, parentTaskId: 2 }).success).toBe(false);
    expect(createTaskInputSchema.safeParse({ name: 'n', parentTaskId: 2 }).success).toBe(true);
  });
});
