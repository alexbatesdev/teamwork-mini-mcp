export interface SlimComment {
  id: number;
  body: string;
  contentType: string;
  authorUserId: number | null;
  postedAt: string | null;
  updatedAt: string | null;
}

/**
 * The Teamwork v3 comment payload. Field names below reflect the documented v3
 * shape, but a few (author id, posted date) have historically varied between
 * v1/v3, so the optional fallbacks are read by `projectComment` to avoid
 * silently dropping a value. Verify against live data via `npm run smoke`.
 */
export interface RawTeamworkComment {
  id: number;
  body?: string;
  contentType?: string;
  // Author — v3 uses `userId`; older payloads used `createdBy`/`postedByUserId`.
  userId?: number | null;
  createdBy?: number | null;
  postedByUserId?: number | null;
  // Timestamps — v3 uses `dateCreated`/`dateLastEdited`; some payloads use `postedAt`/`createdAt`.
  dateCreated?: string | null;
  postedAt?: string | null;
  createdAt?: string | null;
  dateLastEdited?: string | null;
  updatedAt?: string | null;
}

function firstDefined<T>(...values: (T | null | undefined)[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export function projectComment(raw: RawTeamworkComment): SlimComment {
  return {
    id: raw.id,
    body: raw.body ?? '',
    contentType: raw.contentType ?? 'TEXT',
    authorUserId: firstDefined(raw.userId, raw.createdBy, raw.postedByUserId),
    postedAt: firstDefined(raw.dateCreated, raw.postedAt, raw.createdAt),
    updatedAt: firstDefined(raw.dateLastEdited, raw.updatedAt),
  };
}
