import { describe, it, expect, vi } from 'vitest';

import {
  createStartTaskDevHandler,
  startTaskDevInputSchema,
} from '../../src/tools/start-task-dev.js';
import type { TeamworkClient } from '../../src/teamwork/client.js';

function fakeClient(overrides: Partial<TeamworkClient>): TeamworkClient {
  return overrides as unknown as TeamworkClient;
}

// Ordered like the real "Product: Development" workflow: dev sits second.
const STAGES = [
  { id: 100, name: 'Ready for Development' },
  { id: 200, name: 'Dev in Progress' },
  { id: 300, name: 'Ready for QA' },
  { id: 900, name: 'Closed/Done' },
];

describe('start_task_dev handler', () => {
  it('moves a new, unstaged task into Dev in Progress', async () => {
    const getTaskWorkflowStage = vi
      .fn()
      .mockResolvedValue({ status: 'new', stage: { stageId: 0, workflowId: 53311 } });
    const listWorkflowStages = vi.fn().mockResolvedValue(STAGES);
    const moveTaskToWorkflowStage = vi.fn().mockResolvedValue(undefined);
    const handler = createStartTaskDevHandler(
      fakeClient({ getTaskWorkflowStage, listWorkflowStages, moveTaskToWorkflowStage }),
    );

    const result = await handler({ taskId: 42 });

    expect(moveTaskToWorkflowStage).toHaveBeenCalledWith(42, 53311, 200);
    expect(result).toMatchObject({ taskId: 42, moved: true, stage: 'Dev in Progress' });
  });

  it('no-ops when already in Dev in Progress (idempotent)', async () => {
    const getTaskWorkflowStage = vi
      .fn()
      .mockResolvedValue({ status: 'new', stage: { stageId: 200, workflowId: 53311 } });
    const listWorkflowStages = vi.fn().mockResolvedValue(STAGES);
    const moveTaskToWorkflowStage = vi.fn();
    const handler = createStartTaskDevHandler(
      fakeClient({ getTaskWorkflowStage, listWorkflowStages, moveTaskToWorkflowStage }),
    );

    const result = await handler({ taskId: 42 });

    expect(moveTaskToWorkflowStage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ moved: false, stage: 'Dev in Progress' });
  });

  it('refuses to move a task backward from a later stage', async () => {
    const getTaskWorkflowStage = vi
      .fn()
      .mockResolvedValue({ status: 'new', stage: { stageId: 300, workflowId: 53311 } });
    const listWorkflowStages = vi.fn().mockResolvedValue(STAGES);
    const moveTaskToWorkflowStage = vi.fn();
    const handler = createStartTaskDevHandler(
      fakeClient({ getTaskWorkflowStage, listWorkflowStages, moveTaskToWorkflowStage }),
    );

    const result = await handler({ taskId: 42 });

    expect(moveTaskToWorkflowStage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ moved: false, stage: 'Ready for QA' });
    expect(result.reason).toMatch(/backward/);
  });

  it('never touches a completed task', async () => {
    const getTaskWorkflowStage = vi
      .fn()
      .mockResolvedValue({ status: 'completed', stage: { stageId: 100, workflowId: 53311 } });
    const listWorkflowStages = vi.fn();
    const moveTaskToWorkflowStage = vi.fn();
    const handler = createStartTaskDevHandler(
      fakeClient({ getTaskWorkflowStage, listWorkflowStages, moveTaskToWorkflowStage }),
    );

    const result = await handler({ taskId: 42 });

    expect(listWorkflowStages).not.toHaveBeenCalled();
    expect(moveTaskToWorkflowStage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ moved: false });
  });

  it('no-ops when the task is in no workflow', async () => {
    const getTaskWorkflowStage = vi.fn().mockResolvedValue({ status: 'new', stage: null });
    const moveTaskToWorkflowStage = vi.fn();
    const handler = createStartTaskDevHandler(
      fakeClient({ getTaskWorkflowStage, moveTaskToWorkflowStage }),
    );

    const result = await handler({ taskId: 42 });

    expect(moveTaskToWorkflowStage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ moved: false, stage: null });
  });

  it('no-ops when the workflow has no Dev in Progress stage', async () => {
    const getTaskWorkflowStage = vi
      .fn()
      .mockResolvedValue({ status: 'new', stage: { stageId: 0, workflowId: 999 } });
    const listWorkflowStages = vi.fn().mockResolvedValue([{ id: 1, name: 'To Do' }]);
    const moveTaskToWorkflowStage = vi.fn();
    const handler = createStartTaskDevHandler(
      fakeClient({ getTaskWorkflowStage, listWorkflowStages, moveTaskToWorkflowStage }),
    );

    const result = await handler({ taskId: 42 });

    expect(moveTaskToWorkflowStage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ moved: false, stage: null });
  });

  it('matches the stage name case-insensitively', async () => {
    const getTaskWorkflowStage = vi
      .fn()
      .mockResolvedValue({ status: 'reopened', stage: { stageId: 100, workflowId: 53311 } });
    // Lower-cased name still resolves to the target.
    const listWorkflowStages = vi
      .fn()
      .mockResolvedValue([{ id: 100, name: 'Ready for Development' }, { id: 200, name: 'DEV IN PROGRESS' }]);
    const moveTaskToWorkflowStage = vi.fn().mockResolvedValue(undefined);
    const handler = createStartTaskDevHandler(
      fakeClient({ getTaskWorkflowStage, listWorkflowStages, moveTaskToWorkflowStage }),
    );

    const result = await handler({ taskId: 42 });

    expect(moveTaskToWorkflowStage).toHaveBeenCalledWith(42, 53311, 200);
    expect(result.moved).toBe(true);
  });
});

describe('startTaskDevInputSchema', () => {
  it('accepts a positive integer taskId', () => {
    expect(startTaskDevInputSchema.parse({ taskId: 5 })).toEqual({ taskId: 5 });
  });

  it('rejects a missing taskId', () => {
    expect(() => startTaskDevInputSchema.parse({})).toThrow();
  });

  it('rejects a non-positive or non-integer taskId', () => {
    expect(() => startTaskDevInputSchema.parse({ taskId: 0 })).toThrow();
    expect(() => startTaskDevInputSchema.parse({ taskId: 1.5 })).toThrow();
  });
});
