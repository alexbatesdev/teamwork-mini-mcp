import { z } from 'zod';

import { projectTask, type SlimTask } from '../projections/task.js';
import type { TeamworkClient } from '../teamwork/client.js';

export const getTaskInputSchema = z.object({
  taskId: z.number().int().positive(),
});

export type GetTaskInput = z.infer<typeof getTaskInputSchema>;

export function createGetTaskHandler(client: TeamworkClient) {
  return async (input: GetTaskInput): Promise<SlimTask> => {
    const raw = await client.getTask(input.taskId);
    return projectTask(raw);
  };
}
