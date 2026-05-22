#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'),
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { TeamworkClient } from './teamwork/client.js';
import { createGetTaskHandler, getTaskInputSchema } from './tools/get-task.js';
import {
  createListSubtasksHandler,
  listSubtasksInputSchema,
} from './tools/list-subtasks.js';
import {
  createSearchTasksHandler,
  searchTasksInputSchema,
} from './tools/search-tasks.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function main(): Promise<void> {
  const client = new TeamworkClient({
    site: requireEnv('TEAMWORK_SITE'),
    apiKey: requireEnv('TEAMWORK_API_KEY'),
  });

  const server = new McpServer({ name: 'teamwork-mini', version: '0.0.1' });

  const getTask = createGetTaskHandler(client);
  const listSubtasks = createListSubtasksHandler(client);
  const searchTasks = createSearchTasksHandler(client);

  const asText = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  });

  server.registerTool(
    'get_task',
    {
      description:
        'Fetch a single Teamwork task by id. Returns only the essential fields (no permissions, workflow stages, follower lists, etc.) to keep context lean.',
      inputSchema: getTaskInputSchema.shape,
    },
    async (input) => asText(await getTask(input)),
  );

  server.registerTool(
    'list_subtasks',
    {
      description:
        'List the direct subtasks of a given Teamwork task. Returns each subtask in the same slim shape as get_task. Empty array when the task has no subtasks.',
      inputSchema: listSubtasksInputSchema.shape,
    },
    async (input) => asText(await listSubtasks(input)),
  );

  server.registerTool(
    'search_tasks',
    {
      description:
        'Search Teamwork tasks whose title or description contains the given text. Returns up to pageSize (default 25, max 100) tasks in the slim shape.',
      inputSchema: searchTasksInputSchema.shape,
    },
    async (input) => asText(await searchTasks(input)),
  );

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('[teamwork-mini-mcp] fatal:', err);
  process.exit(1);
});
