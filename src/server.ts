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
import {
  createGetCurrentUserHandler,
  getCurrentUserInputSchema,
} from './tools/get-current-user.js';
import { createGetTaskHandler, getTaskInputSchema } from './tools/get-task.js';
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
  const searchTasks = createSearchTasksHandler(client);
  const getCurrentUser = createGetCurrentUserHandler(client);

  const asText = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  });

  server.registerTool(
    'get_task',
    {
      description:
        'Fetch a single Teamwork task by id, including its comments (most recent ' +
        '20 by default; raise with commentLimit, max 200). Comments are returned ' +
        'chronologically with omittedCommentCount noting any dropped by the limit. ' +
        'Also walks the task\'s subtasks: subtaskDepth (default 1, max 5) controls how ' +
        'many levels are fetched (1 = direct subtasks, 2 = their subtasks too, 0 = none). ' +
        'Subtasks come back as a flat, breadth-first list, each tagged with its depth and ' +
        'carrying parentTaskId so the tree can be rebuilt. The list is paginated via ' +
        'subtaskPageSize (default 20, max 200) and subtaskPage (1-based); the subtaskPage ' +
        'metadata reports total/returned/hasMore. Returns only the essential task fields ' +
        '(no permissions, workflow stages, follower lists, etc.) to keep context lean.',
      inputSchema: getTaskInputSchema.shape,
    },
    async (input) => asText(await getTask(input)),
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

  server.registerTool(
    'get_current_user',
    {
      description:
        'Return the Teamwork user that the configured API key authenticates as ' +
        '(the "me" identity). Takes no arguments. Returns essential identity fields ' +
        '(id, name, email, title, company, role flags, timezone, timestamps) in a slim shape.',
      inputSchema: getCurrentUserInputSchema.shape,
    },
    async (input) => asText(await getCurrentUser(input)),
  );

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('[teamwork-mini-mcp] fatal:', err);
  process.exit(1);
});
