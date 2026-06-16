# teamwork-mini-mcp

A minimal [MCP](https://modelcontextprotocol.io) server for Teamwork Projects. It exposes two read-only tools that return tasks in a slim shape (essential fields only — no permissions, workflow stages, follower lists, etc.) to keep LLM context lean.

## Tools

| Tool | Description |
| --- | --- |
| `get_task` | Fetch a single task by id, including its comments and subtasks (see below) |
| `search_tasks` | Search tasks by title/description text (default 25 results, max 100) |

### `get_task` subtasks

`get_task` also walks the task's subtasks:

- `subtaskDepth` (default `1`, max `5`) — how many levels to fetch. `1` returns direct subtasks, `2` also their subtasks, `0` none.
- Subtasks come back as a **flat, breadth-first `subtasks` list**, each entry tagged with `depth` and carrying `parentTaskId`, so the hierarchy can be rebuilt.
- The list is paginated with `subtaskPageSize` (default `20`, max `200`) and `subtaskPage` (1-based). The response's `subtaskPage` object reports `{ depth, page, pageSize, total, returned, hasMore }`.

Comments are the most recent 20 by default (raise with `commentLimit`, max 200), returned chronologically with `omittedCommentCount` noting any dropped by the limit.

## Requirements

- Node.js 18+ (uses the built-in `fetch`)
- A Teamwork API key (Profile → Edit My Details → API & Mobile in your Teamwork site)

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a `.env` file in the repo root:

   ```sh
   TEAMWORK_SITE=yourcompany.teamwork.com
   TEAMWORK_API_KEY=your_api_key
   ```

   `TEAMWORK_SITE` is your Teamwork domain — a leading `https://` and trailing slashes are stripped automatically.

3. Build and run:

   ```sh
   npm run build   # compile TypeScript to dist/
   npm start       # run the compiled server over stdio
   ```

   Or run directly from source during development:

   ```sh
   npm run dev
   ```

## Connecting to an MCP client

The server communicates over stdio. For Claude Code, register it with:

```sh
claude mcp add teamwork-mini -- node /path/to/teamwork-mini-mcp/dist/server.js
```

Or add it to your client's MCP config manually:

```json
{
  "mcpServers": {
    "teamwork-mini": {
      "command": "node",
      "args": ["/path/to/teamwork-mini-mcp/dist/server.js"]
    }
  }
}
```

The server loads `.env` from the repo root itself, so no `env` block is needed in the client config.

## Development

```sh
npm test            # run the vitest suite (uses recorded fixtures, no network)
npm run test:watch  # watch mode
npm run smoke       # hit the real Teamwork API: npm run smoke -- <taskId> <searchQuery>
```

### Project layout

```
src/
  server.ts          MCP server entry point (stdio transport)
  teamwork/client.ts Thin HTTP client for the Teamwork v3 API
  projections/task.ts Maps raw API tasks to the slim shape
  tools/             One handler per MCP tool
  dev/smoke.ts       Manual end-to-end check against the live API
tests/               Vitest suite with JSON fixtures
```
