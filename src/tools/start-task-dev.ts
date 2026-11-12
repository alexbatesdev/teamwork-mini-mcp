import { z } from 'zod';

import type { TeamworkClient } from '../teamwork/client.js';

/**
 * The single stage this tool is allowed to move a task into, matched
 * case-insensitively against the task's own workflow. The tool never accepts a
 * stage id, so it is structurally incapable of setting any other stage —
 * completed/merged/terminal stages included.
 */
const DEV_STAGE_NAME = 'dev in progress';

export const startTaskDevInputSchema = z.object({
  taskId: z
    .number()
    .int()
    .positive()
    .describe('The id of the task to move into the "Dev in Progress" workflow stage.'),
});

export type StartTaskDevInput = z.infer<typeof startTaskDevInputSchema>;

export interface StartTaskDevResult {
  taskId: number;
  /** Whether this call actually moved the task (false for every no-op). */
  moved: boolean;
  /** The task's resulting stage name, or its current one when we didn't move it. */
  stage: string | null;
  /** Human-readable outcome, including why a no-op was a no-op. */
  reason: string;
}

/**
 * Move a task forward into its workflow's "Dev in Progress" stage — and nothing
 * else. Never moves a task backward from a later stage and never touches a
 * completed task; both are reported as no-ops.
 */
export function createStartTaskDevHandler(client: TeamworkClient) {
  return async (input: StartTaskDevInput): Promise<StartTaskDevResult> => {
    const { taskId } = input;
    const noop = (stage: string | null, reason: string): StartTaskDevResult => ({
      taskId,
      moved: false,
      stage,
      reason,
    });

    const { status, stage } = await client.getTaskWorkflowStage(taskId);
    if (!stage) return noop(null, 'Task is not in a workflow; nothing to do.');
    if (status === 'completed') return noop(null, 'Task is completed; refusing to move it.');

    const stages = await client.listWorkflowStages(stage.workflowId);
    const targetIdx = stages.findIndex((s) => s.name.trim().toLowerCase() === DEV_STAGE_NAME);
    if (targetIdx === -1) {
      return noop(null, `Workflow ${stage.workflowId} has no "Dev in Progress" stage.`);
    }
    const target = stages[targetIdx]!;

    if (stage.stageId === target.id) return noop(target.name, `Already in "${target.name}".`);

    // A stage later in display order than the target means dev is already past;
    // refuse to move it backward. stageId 0 (unstaged) has no index — it's before
    // everything, so it falls through to the move.
    const currentIdx = stages.findIndex((s) => s.id === stage.stageId);
    if (currentIdx > targetIdx) {
      const current = stages[currentIdx]!;
      return noop(current.name, `Task is past dev (currently "${current.name}"); refusing to move it backward.`);
    }

    await client.moveTaskToWorkflowStage(taskId, stage.workflowId, target.id);
    return { taskId, moved: true, stage: target.name, reason: `Moved to "${target.name}".` };
  };
}
