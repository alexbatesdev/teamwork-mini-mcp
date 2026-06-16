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
