import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

describe('server tool registry', () => {
  it('registers the expected tools and no create_task', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', resolve('src/server.ts')],
      env: { ...process.env, TEAMWORK_SITE: 'example', TEAMWORK_API_KEY: 'x' } as Record<string, string>,
    });
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(transport);
    try {
      const names = (await client.listTools()).tools.map((t) => t.name).sort();
      expect(names).toEqual(['get_current_user', 'get_task', 'list_my_tasks', 'search_tasks', 'start_task_dev']);
    } finally {
      await client.close();
    }
  }, 30000);
});
