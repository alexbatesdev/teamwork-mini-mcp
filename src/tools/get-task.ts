import { z } from 'zod';

import { projectComment, type SlimComment } from '../projections/comment.js';
import { projectTask, type SlimTask } from '../projections/task.js';
import type { TeamworkClient } from '../teamwork/client.js';

const DEFAULT_COMMENT_LIMIT = 20;

export const getTaskInputSchema = z.object({
  taskId: z.number().int().positive(),
  commentLimit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe(
      `Max number of most-recent comments to include (default ${DEFAULT_COMMENT_LIMIT}, max 200).`,
    ),
});

export type GetTaskInput = z.infer<typeof getTaskInputSchema>;

export interface TaskWithComments extends SlimTask {
  comments: SlimComment[];
  /** How many older comments were dropped by the limit (0 when all are returned). */
  omittedCommentCount: number;
}

export function createGetTaskHandler(client: TeamworkClient) {
  return async (input: GetTaskInput): Promise<TaskWithComments> => {
    const limit = input.commentLimit ?? DEFAULT_COMMENT_LIMIT;

    const [raw, commentsResult] = await Promise.all([
      client.getTask(input.taskId),
      client.getTaskComments(input.taskId, { limit }),
    ]);

    const comments = commentsResult.comments
      .map(projectComment)
      // The API gives newest-first; present chronologically for readability.
      // ISO-8601 timestamps sort lexicographically; nulls sort last.
      .sort((a, b) => (a.postedAt ?? '￿').localeCompare(b.postedAt ?? '￿'));

    return {
      ...projectTask(raw),
      comments,
      omittedCommentCount: Math.max(0, commentsResult.total - comments.length),
    };
  };
}
