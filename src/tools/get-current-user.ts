import { z } from 'zod';

import { projectUser, type SlimUser } from '../projections/user.js';
import type { TeamworkClient } from '../teamwork/client.js';

export const getCurrentUserInputSchema = z.object({});

export type GetCurrentUserInput = z.infer<typeof getCurrentUserInputSchema>;

export function createGetCurrentUserHandler(client: TeamworkClient) {
  return async (_input: GetCurrentUserInput): Promise<SlimUser> => {
    const raw = await client.getCurrentUser();
    return projectUser(raw);
  };
}
