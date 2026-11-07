# teamwork-mini-mcp

A minimal [MCP](https://modelcontextprotocol.io) server for Teamwork Projects. It exposes mostly read-only tools that return data in a slim shape (essential fields only — no permissions, workflow stages, follower lists, etc.) to keep LLM context lean. The write tools are narrow: `start_task_dev` can only nudge a task into its "Dev in Progress" workflow stage, and `create_task` only creates new tasks (never edits, completes or closes one).

## Tools

| Tool | Description |
| --- | --- |
| `get_task` | Fetch a single task by id, including its comments and subtasks (see below) |
| `search_tasks` | Search tasks by title/description text (default 25 results, max 100) |
| `list_my_tasks` | All tasks assigned to the authenticated user as one flat array (open tasks by default; pass `includeCompleted: true` for completed ones too) |
| `get_current_user` | Return the user the configured API key authenticates as (takes no arguments) |
| `start_task_dev` | **(write)** Move a task forward into its workflow's "Dev in Progress" stage (see below) |
| `create_task` | **(write)** Create a task in a tasklist (`tasklistId`) or a subtask (`parentTaskId`) from `name`, optional `description`, optional `assigneeUserId`; returns `{ id, url }` |

Every returned task carries an `assignees` array of `{ id, name }` — names are resolved server-side from the Teamwork API's user sideload (`include=users`), so there's no need for a separate name→id lookup. `name` is `null` only if the API didn't include that user in the sideload.

### `start_task_dev`

A write tool, intentionally narrow. Given `{ taskId }` it moves that task into the **"Dev in Progress"** stage of whatever workflow the task lives in, resolving the stage **by name** from the live workflow (case-insensitive) rather than a hardcoded id. It never accepts a stage id, so it is structurally incapable of completing, merging, closing, or deleting a task, or setting any other stage. It is a no-op (with a `reason`) when the task is already in "Dev in Progress", is completed, sits in a later stage (never moves backward), or is in a workflow with no such stage. Returns `{ taskId, moved, stage, reason }`.

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
