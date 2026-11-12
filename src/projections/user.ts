export interface SlimUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  companyId: number;
  isAdmin: boolean;
  isClientUser: boolean;
  isServiceAccount: boolean;
  userType: string;
  timezone: string | null;
  avatarUrl: string | null;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The shape of entries in a v3 response's `included.users` sideload (requested
 * with `?include=users`). Only the fields we consume are declared; the API
 * sends many more.
 */
export interface RawSideloadedUser {
  id: number;
  firstName: string;
  lastName: string;
}

/** `included.users` from a v3 response: user id (as a string key) → user. */
export type RawUsersById = Record<string, RawSideloadedUser>;

export interface RawTeamworkPerson {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  companyId: number;
  isAdmin: boolean;
  isClientUser: boolean;
  isServiceAccount: boolean;
  userType: string;
  timezone: string | null;
  avatarUrl: string | null;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export function projectUser(raw: RawTeamworkPerson): SlimUser {
  return {
    id: raw.id,
    firstName: raw.firstName,
    lastName: raw.lastName,
    email: raw.email,
    title: raw.title,
    companyId: raw.companyId,
    isAdmin: raw.isAdmin,
    isClientUser: raw.isClientUser,
    isServiceAccount: raw.isServiceAccount,
    userType: raw.userType,
    timezone: raw.timezone,
    avatarUrl: raw.avatarUrl,
    lastLogin: raw.lastLogin,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
