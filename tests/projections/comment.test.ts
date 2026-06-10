import { describe, it, expect } from 'vitest';

import { projectComment } from '../../src/projections/comment.js';

describe('projectComment', () => {
  it('maps the documented v3 comment shape to the slim shape', () => {
    const slim = projectComment({
      id: 9002,
      body: 'hello',
      contentType: 'TEXT',
      userId: 643631,
      dateCreated: '2026-05-19T14:30:00Z',
      dateLastEdited: '2026-05-19T14:45:00Z',
    });

    expect(slim).toEqual({
      id: 9002,
      body: 'hello',
      contentType: 'TEXT',
      authorUserId: 643631,
      postedAt: '2026-05-19T14:30:00Z',
      updatedAt: '2026-05-19T14:45:00Z',
    });
  });

  it('falls back across author and timestamp field-name variants', () => {
    const slim = projectComment({
      id: 1,
      body: 'x',
      createdBy: 555,
      postedAt: '2026-01-01T00:00:00Z',
    });

    expect(slim.authorUserId).toBe(555);
    expect(slim.postedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('uses safe defaults for a missing body, contentType, and absent fields', () => {
    const slim = projectComment({ id: 2 });

    expect(slim.body).toBe('');
    expect(slim.contentType).toBe('TEXT');
    expect(slim.authorUserId).toBeNull();
    expect(slim.postedAt).toBeNull();
    expect(slim.updatedAt).toBeNull();
  });
});
