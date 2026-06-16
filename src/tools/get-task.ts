import { z } from 'zod';

import { projectComment, type SlimComment } from '../projections/comment.js';
import { projectTask, type SlimTask } from '../projections/task.js';
import type { TeamworkClient } from '../teamwork/client.js';

const DEFAULT_COMMENT_LIMIT = 20;
const DEFAULT_SUBTASK_DEPTH = 1;
const MAX_SUBTASK_DEPTH = 5;
const DEFAULT_SUBTASK_PAGE_SIZE = 20;
const MAX_SUBTASK_PAGE_SIZE = 200;

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
  subtaskDepth: z
    .number()
    .int()
    .min(0)
    .max(MAX_SUBTASK_DEPTH)
    .optional()
    .describe(
      `How many levels of subtasks to walk (default ${DEFAULT_SUBTASK_DEPTH}, max ${MAX_SUBTASK_DEPTH}). ` +
        '1 returns the task plus its direct subtasks; 2 also includes their subtasks; 0 returns no subtasks. ' +
        'Returned subtasks are a flat list in breadth-first order, each tagged with its depth.',
    ),
  subtaskPage: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Which page of the flattened subtask list to return (1-based, default 1).'),
  subtaskPageSize: z
    .number()
    .int()
    .positive()
    .max(MAX_SUBTASK_PAGE_SIZE)
    .optional()
    .describe(
      `Max number of subtasks per page (default ${DEFAULT_SUBTASK_PAGE_SIZE}, max ${MAX_SUBTASK_PAGE_SIZE}).`,
    ),
});

export type GetTaskInput = z.infer<typeof getTaskInputSchema>;

/** A subtask in the flat list, tagged with how many levels below the task it sits. */
export interface SubtaskEntry extends SlimTask {
  depth: number;
}

export interface SubtaskPageInfo {
  /** The requested traversal depth. */
  depth: number;
  page: number;
  pageSize: number;
  /** Total subtasks collected across all depths up to `depth`. */
  total: number;
  /** How many were returned on this page. */
  returned: number;
  /** Whether further pages remain. */
  hasMore: boolean;
}

export interface TaskWithComments extends SlimTask {
  comments: SlimComment[];
  /** How many older comments were dropped by the limit (0 when all are returned). */
  omittedCommentCount: number;
  /** Descendant subtasks (flat, breadth-first) for the requested page. */
  subtasks: SubtaskEntry[];
  subtaskPage: SubtaskPageInfo;
}

/**
 * Breadth-first walk of a task's descendants down to `depth` levels. Each level
 * is fetched in parallel; results stay in BFS order (parents before children).
 * A `visited` set guards against cycles and duplicate fetches.
 */
async function collectSubtasks(
  client: TeamworkClient,
  rootId: number,
  depth: number,
): Promise<SubtaskEntry[]> {
  const out: SubtaskEntry[] = [];
  const visited = new Set<number>([rootId]);
  let frontier = [rootId];

  for (let level = 1; level <= depth && frontier.length > 0; level++) {
    const childLists = await Promise.all(frontier.map((id) => client.listSubtasks(id)));
    const next: number[] = [];
    for (const children of childLists) {
      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        out.push({ ...projectTask(child), depth: level });
        next.push(child.id);
      }
    }
    frontier = next;
  }

  return out;
}

export function createGetTaskHandler(client: TeamworkClient) {
  return async (input: GetTaskInput): Promise<TaskWithComments> => {
    const limit = input.commentLimit ?? DEFAULT_COMMENT_LIMIT;
    const depth = input.subtaskDepth ?? DEFAULT_SUBTASK_DEPTH;
    const page = input.subtaskPage ?? 1;
    const pageSize = input.subtaskPageSize ?? DEFAULT_SUBTASK_PAGE_SIZE;

    const [raw, commentsResult, allSubtasks] = await Promise.all([
      client.getTask(input.taskId),
      client.getTaskComments(input.taskId, { limit }),
      collectSubtasks(client, input.taskId, depth),
    ]);

    const comments = commentsResult.comments
      .map(projectComment)
      // The API gives newest-first; present chronologically for readability.
      // ISO-8601 timestamps sort lexicographically; nulls sort last.
      .sort((a, b) => (a.postedAt ?? '￿').localeCompare(b.postedAt ?? '￿'));

    const start = (page - 1) * pageSize;
    const subtasks = allSubtasks.slice(start, start + pageSize);

    return {
      ...projectTask(raw),
      comments,
      omittedCommentCount: Math.max(0, commentsResult.total - comments.length),
      subtasks,
      subtaskPage: {
        depth,
        page,
        pageSize,
        total: allSubtasks.length,
        returned: subtasks.length,
        hasMore: start + pageSize < allSubtasks.length,
      },
    };
  };
}
