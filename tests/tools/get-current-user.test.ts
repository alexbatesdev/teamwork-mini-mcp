import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createGetCurrentUserHandler,
  getCurrentUserInputSchema,
} from '../../src/tools/get-current-user.js';
import type { TeamworkClient } from '../../src/teamwork/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawPerson = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'teamwork-me.json'), 'utf-8'),
).person;

function fakeClient(overrides: Partial<TeamworkClient>): TeamworkClient {
  return overrides as unknown as TeamworkClient;
}

describe('get_current_user handler', () => {
  it('calls client.getCurrentUser and projects to the slim shape', async () => {
    const getCurrentUser = vi.fn().mockResolvedValue(rawPerson);
    const handler = createGetCurrentUserHandler(fakeClient({ getCurrentUser }));

    const result = await handler({});

    expect(getCurrentUser).toHaveBeenCalledOnce();
    expect(result).toEqual({
      id: 643631,
      firstName: 'Alex',
      lastName: 'Bates',
      email: 'alex.bates@builtapp.com',
      title: '',
      companyId: 204144,
      isAdmin: false,
      isClientUser: false,
      isServiceAccount: false,
      userType: 'account',
      timezone: 'America/Toronto',
      avatarUrl: 'https://s3.amazonaws.com/TWFiles/809990/userAvatar/tf_34a2bb73.pfp_crop.jpg',
      lastLogin: '2026-06-16T18:08:58Z',
      createdAt: '2025-07-07T16:17:48Z',
      updatedAt: '2026-06-15T21:08:29Z',
    });
  });

  it('drops fields outside the slim shape (e.g. companyRoleId, deleted)', async () => {
    const getCurrentUser = vi.fn().mockResolvedValue(rawPerson);
    const handler = createGetCurrentUserHandler(fakeClient({ getCurrentUser }));

    const result = await handler({});

    expect(result).not.toHaveProperty('companyRoleId');
    expect(result).not.toHaveProperty('deleted');
  });
});

describe('getCurrentUserInputSchema', () => {
  it('accepts an empty object', () => {
    expect(getCurrentUserInputSchema.parse({})).toEqual({});
  });
});
