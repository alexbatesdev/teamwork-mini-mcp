import 'dotenv/config';

import { TeamworkClient } from '../teamwork/client.js';
import { projectTask } from '../projections/task.js';
import { projectUser } from '../projections/user.js';

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

  const taskId = Number(process.argv[2] ?? 39861084);
  const query = process.argv[3] ?? 'amplitude';

  console.log(`\n--- get_task(${taskId}) ---`);
  const task = projectTask(await client.getTask(taskId));
  console.log(JSON.stringify(task, null, 2));
  const taskSize = JSON.stringify(task).length;

  console.log(`\n--- comments(${taskId}) ---`);
  const { comments, total } = await client.getTaskComments(taskId, { limit: 5 });
  console.log(`${total} comment(s) total; raw shape of first (verify field names):`);
  if (comments.length > 0) console.log(JSON.stringify(comments[0], null, 2));

  console.log(`\n--- subtasks(${taskId}) ---`);
  const subs = (await client.listSubtasks(taskId)).map(projectTask);
  console.log(`${subs.length} direct subtask(s)`);
  if (subs.length > 0) console.log(JSON.stringify(subs[0], null, 2));

  console.log(`\n--- search_tasks(${JSON.stringify(query)}) ---`);
  const hits = (await client.searchTasks(query, { pageSize: 5 })).map(projectTask);
  console.log(`${hits.length} match(es); first:`);
  if (hits.length > 0) console.log(JSON.stringify(hits[0], null, 2));

  console.log(`\n--- get_current_user ---`);
  const me = projectUser(await client.getCurrentUser());
  console.log(JSON.stringify(me, null, 2));

  console.log(`\nSlim task payload size: ${taskSize} bytes`);
}

main().catch((err) => {
  console.error('smoke failed:', err);
  process.exit(1);
});
