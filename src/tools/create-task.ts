import { z } from 'zod';

import type { TeamworkClient } from '../teamwork/client.js';

export const createTaskInputSchema = z
  .object({
    tasklistId: z.number().int().positive().optional().describe('Tasklist to create the task in.'),
    parentTaskId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Parent task id; creates a subtask under it instead of a top-level task.'),
    name: z.string().trim().min(1).describe('Task title.'),
    description: z.string().optional().describe('Task description.'),
    assigneeUserId: z.number().int().positive().optional().describe('User id to assign the task to.'),
  })
  .refine((v) => (v.tasklistId === undefined) !== (v.parentTaskId === undefined), {
    message: 'Provide exactly one of tasklistId or parentTaskId.',
  });

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

/** Create a task or subtask. Sets no status, stage or completion, by construction. */
export function createCreateTaskHandler(client: TeamworkClient) {
  return async (input: CreateTaskInput): Promise<{ id: number; url: string }> =>
    client.createTask(createTaskInputSchema.parse(input));
}
