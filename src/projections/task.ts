import type { RawUsersById } from './user.js';

/** An assignee with its name resolved from the response's user sideload. */
export interface TaskAssignee {
  id: number;
  /** "First Last", or null when the user wasn't present in the sideload. */
  name: string | null;
}

export interface SlimTask {
  id: number;
  name: string;
  description: string;
  status: string;
  priority: string | null;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  assignees: TaskAssignee[];
  tagIds: number[] | null;
  parentTaskId: number | null;
  tasklistId: number;
  createdAt: string;
  updatedAt: string;
}

export interface RawTeamworkTask {
  id: number;
  name: string;
  description: string;
  status: string;
  priority: string | null;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  assigneeUserIds: number[] | null;
  tagIds: number[] | null;
  parentTaskId: number;
  tasklistId: number;
  createdAt: string;
  updatedAt: string;
}

export function projectTask(raw: RawTeamworkTask, users: RawUsersById = {}): SlimTask {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    status: raw.status,
    priority: raw.priority,
    progress: raw.progress,
    startDate: raw.startDate,
    dueDate: raw.dueDate,
    assignees: (raw.assigneeUserIds ?? []).map((id) => {
      const user = users[String(id)];
      const name = user ? `${user.firstName} ${user.lastName}`.trim() : '';
      return { id, name: name || null };
    }),
    tagIds: raw.tagIds,
    parentTaskId: raw.parentTaskId === 0 ? null : raw.parentTaskId,
    tasklistId: raw.tasklistId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
