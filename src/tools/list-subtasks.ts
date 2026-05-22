import { z } from 'zod';

import { projectTask, type SlimTask } from '../projections/task.js';
import type { TeamworkClient } from '../teamwork/client.js';

export const listSubtasksInputSchema = z.object({
  taskId: z.number().int().positive(),
});

export type ListSubtasksInput = z.infer<typeof listSubtasksInputSchema>;

export function createListSubtasksHandler(client: TeamworkClient) {
  return async (input: ListSubtasksInput): Promise<SlimTask[]> => {
    const raw = await client.listSubtasks(input.taskId);
    return raw.map(projectTask);
  };
}
