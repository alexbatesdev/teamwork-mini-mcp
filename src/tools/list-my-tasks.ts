import { z } from 'zod';

import { projectTask, type SlimTask } from '../projections/task.js';
import type { TeamworkClient } from '../teamwork/client.js';

export const listMyTasksInputSchema = z.object({
  includeCompleted: z
    .boolean()
    .optional()
    .describe('Also include completed tasks (default false: open tasks only).'),
});

export type ListMyTasksInput = z.infer<typeof listMyTasksInputSchema>;

export function createListMyTasksHandler(client: TeamworkClient) {
  return async (input: ListMyTasksInput): Promise<SlimTask[]> => {
    const me = await client.getCurrentUser();
    const { tasks, users } = await client.listTasksAssignedTo(me.id, {
      includeCompleted: input.includeCompleted,
    });
    return tasks.map((task) => projectTask(task, users));
  };
}
