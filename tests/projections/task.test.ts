import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectTask } from '../../src/projections/task.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const taskFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-task.json'), 'utf-8'),
);
const subtasksFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-subtasks.json'), 'utf-8'),
);

const EXPECTED_SLIM_KEYS = [
  'assigneeUserIds',
  'createdAt',
  'description',
  'dueDate',
  'id',
  'name',
  'parentTaskId',
  'priority',
  'progress',
  'startDate',
  'status',
  'tagIds',
  'tasklistId',
  'updatedAt',
];

describe('projectTask', () => {
  it('returns exactly the slim key set (no leaks)', () => {
    const slim = projectTask(taskFixture.task);
    expect(Object.keys(slim).sort()).toEqual(EXPECTED_SLIM_KEYS);
  });

  it('copies the essential fields from the raw task', () => {
    const slim = projectTask(taskFixture.task);
    expect(slim.id).toBe(39861084);
    expect(slim.name).toBe('Amplitude Implementation v1');
    expect(slim.description).toContain('Amplitude Resources');
    expect(slim.status).toBe('new');
    expect(slim.priority).toBeNull();
    expect(slim.progress).toBe(0);
    expect(slim.startDate).toBeNull();
    expect(slim.dueDate).toBeNull();
    expect(slim.assigneeUserIds).toEqual([643631]);
    expect(slim.tagIds).toEqual([178467, 126560]);
    expect(slim.tasklistId).toBe(2521973);
    expect(slim.createdAt).toBe('2026-03-17T20:04:52Z');
    expect(slim.updatedAt).toBe('2026-05-20T20:38:58Z');
  });

  it('normalizes a root task parentTaskId 0 to null', () => {
    const slim = projectTask(taskFixture.task);
    expect(slim.parentTaskId).toBeNull();
  });

  it('preserves a populated parentTaskId on a real subtask', () => {
    const firstSubtask = subtasksFixture.tasks[0];
    const slim = projectTask(firstSubtask);
    expect(slim.parentTaskId).toBe(39861084);
    expect(slim.id).toBe(firstSubtask.id);
  });

  it('keeps an arbitrary non-zero parentTaskId as-is', () => {
    const slim = projectTask({ ...taskFixture.task, parentTaskId: 12345 });
    expect(slim.parentTaskId).toBe(12345);
  });
});
