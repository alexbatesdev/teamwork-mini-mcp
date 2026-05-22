import { z } from 'zod';

import { projectTask, type SlimTask } from '../projections/task.js';
import type { TeamworkClient } from '../teamwork/client.js';

export const searchTasksInputSchema = z.object({
  query: z.string().min(1),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type SearchTasksInput = z.infer<typeof searchTasksInputSchema>;

export function createSearchTasksHandler(client: TeamworkClient) {
  return async (input: SearchTasksInput): Promise<SlimTask[]> => {
    const raw = await client.searchTasks(input.query, { pageSize: input.pageSize });
    return raw.map(projectTask);
  };
}
