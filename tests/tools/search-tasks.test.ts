import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSearchTasksHandler,
  searchTasksInputSchema,
} from '../../src/tools/search-tasks.js';
import type { TeamworkClient } from '../../src/teamwork/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawTask = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-task.json'), 'utf-8'),
).task;

function fakeClient(overrides: Partial<TeamworkClient>): TeamworkClient {
  return overrides as unknown as TeamworkClient;
}

describe('search_tasks handler', () => {
  it('calls client.searchTasks with the provided query', async () => {
    const searchTasks = vi.fn().mockResolvedValue([]);
    const handler = createSearchTasksHandler(fakeClient({ searchTasks }));

    await handler({ query: 'amplitude' });

    expect(searchTasks).toHaveBeenCalledWith('amplitude', { pageSize: undefined });
  });

  it('forwards pageSize when provided', async () => {
    const searchTasks = vi.fn().mockResolvedValue([]);
    const handler = createSearchTasksHandler(fakeClient({ searchTasks }));

    await handler({ query: 'x', pageSize: 10 });

    expect(searchTasks).toHaveBeenCalledWith('x', { pageSize: 10 });
  });

  it('projects each match to the slim shape', async () => {
    const searchTasks = vi
      .fn()
      .mockResolvedValue([rawTask, { ...rawTask, id: 12, name: 'two' }]);
    const handler = createSearchTasksHandler(fakeClient({ searchTasks }));

    const result = await handler({ query: 'x' });

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(rawTask.id);
    expect(result[1]!.id).toBe(12);
    expect(result[0]).not.toHaveProperty('userPermissions');
  });
});

describe('searchTasksInputSchema', () => {
  it('accepts a non-empty query', () => {
    expect(searchTasksInputSchema.parse({ query: 'foo' })).toEqual({ query: 'foo' });
  });

  it('rejects an empty query', () => {
    expect(() => searchTasksInputSchema.parse({ query: '' })).toThrow();
  });

  it('accepts an optional pageSize between 1 and 100', () => {
    expect(searchTasksInputSchema.parse({ query: 'x', pageSize: 50 })).toEqual({
      query: 'x',
      pageSize: 50,
    });
    expect(() => searchTasksInputSchema.parse({ query: 'x', pageSize: 0 })).toThrow();
    expect(() => searchTasksInputSchema.parse({ query: 'x', pageSize: 101 })).toThrow();
  });
});
