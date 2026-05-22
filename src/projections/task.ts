export interface SlimTask {
  id: number;
  name: string;
  description: string;
  status: string;
  priority: string | null;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  assigneeUserIds: number[];
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
  assigneeUserIds: number[];
  tagIds: number[] | null;
  parentTaskId: number;
  tasklistId: number;
  createdAt: string;
  updatedAt: string;
}

export function projectTask(raw: RawTeamworkTask): SlimTask {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    status: raw.status,
    priority: raw.priority,
    progress: raw.progress,
    startDate: raw.startDate,
    dueDate: raw.dueDate,
    assigneeUserIds: raw.assigneeUserIds,
    tagIds: raw.tagIds,
    parentTaskId: raw.parentTaskId === 0 ? null : raw.parentTaskId,
    tasklistId: raw.tasklistId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
