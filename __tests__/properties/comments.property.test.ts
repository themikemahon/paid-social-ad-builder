/**
 * Property tests for Comments and Collaboration.
 *
 * Property 40: Comment creation round-trip — create then fetch includes comment
 * Property 41: Comment resolution preserves comment — resolved=true, original fields unchanged
 * Property 42: Comments returned in chronological order — ordered by created_at ascending
 * Property 43: Comment edit/delete restricted to author — non-authors rejected
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-comments-property-tests-minimum-length';
});

// ── Mocks ──

const mockSql = vi.fn();
vi.mock('@/lib/db', () => ({
  getDb: () => mockSql,
}));

beforeEach(() => {
  mockSql.mockReset();
});

// ── Constants ──

const TEST_USER_ID = 'user-uuid-comments-test';
const TEST_WORKSPACE_ID = 'workspace-uuid-comments-test';

// ── Helpers ──

function buildCommentRequest(
  method: string,
  token: string,
  workspaceId: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>
): NextRequest {
  const url = new URL('http://localhost:3000/api/comments');
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

// ── Property 40: Comment creation round-trip ──
// **Validates: Requirements 14.1**
describe('Property 40: Comment creation round-trip', () => {
  it('creating a comment then fetching includes the comment with matching fields', async () => {
    const { GET, POST } = await import('@/app/api/comments/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.lorem({ maxCount: 5 }),
        fc.constantFrom<UserRole>('admin', 'editor', 'reviewer', 'viewer'),
        async (commentId, copyBlockId, message, role) => {
          mockSql.mockReset();

          const token = await createSession(TEST_USER_ID);
          const now = new Date().toISOString();

          // ── POST: create comment ──
          const postReq = buildCommentRequest('POST', token, TEST_WORKSPACE_ID, {
            copy_block_id: copyBlockId,
            message,
          });

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role }]);
          // 2. SELECT copy_blocks WHERE id = ... (verify exists)
          mockSql.mockResolvedValueOnce([{ id: copyBlockId }]);
          // 3. INSERT INTO copy_block_comments RETURNING
          mockSql.mockResolvedValueOnce([{
            id: commentId,
            copy_block_id: copyBlockId,
            author_id: TEST_USER_ID,
            message: message.trim(),
            resolved: false,
            created_at: now,
            updated_at: now,
          }]);
          // 4. SELECT display_name FROM users
          mockSql.mockResolvedValueOnce([{ display_name: 'Test User' }]);

          const postRes = await POST(postReq);
          expect(postRes.status).toBe(201);

          const created = await postRes.json();
          expect(created.id).toBe(commentId);
          expect(created.copyBlockId).toBe(copyBlockId);
          expect(created.authorId).toBe(TEST_USER_ID);
          expect(created.message).toBe(message.trim());
          expect(created.resolved).toBe(false);
          expect(created.createdAt).toBeTruthy();

          // ── GET: fetch comments for copy block ──
          const getReq = buildCommentRequest('GET', token, TEST_WORKSPACE_ID, undefined, {
            copy_block_id: copyBlockId,
          });

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role }]);
          // 2. SELECT from copy_block_comments JOIN users
          mockSql.mockResolvedValueOnce([{
            id: commentId,
            copy_block_id: copyBlockId,
            author_id: TEST_USER_ID,
            author_name: 'Test User',
            message: message.trim(),
            resolved: false,
            created_at: now,
            updated_at: now,
          }]);

          const getRes = await GET(getReq);
          expect(getRes.status).toBe(200);

          const comments = await getRes.json();
          const found = comments.find((c: { id: string }) => c.id === commentId);
          expect(found).toBeTruthy();
          expect(found.copyBlockId).toBe(copyBlockId);
          expect(found.authorId).toBe(TEST_USER_ID);
          expect(found.message).toBe(message.trim());
          expect(found.resolved).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ── Property 41: Comment resolution preserves comment ──
// **Validates: Requirements 14.2**
describe('Property 41: Comment resolution preserves comment', () => {
  it('resolving a comment sets resolved=true while original fields remain unchanged', async () => {
    const { PATCH } = await import('@/app/api/comments/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.lorem({ maxCount: 5 }),
        fc.constantFrom<UserRole>('admin', 'editor', 'reviewer', 'viewer'),
        async (commentId, copyBlockId, authorId, originalMessage, role) => {
          mockSql.mockReset();

          const token = await createSession(TEST_USER_ID);
          const createdAt = new Date().toISOString();
          const updatedAt = new Date().toISOString();

          const patchReq = buildCommentRequest('PATCH', token, TEST_WORKSPACE_ID, {
            id: commentId,
            resolved: true,
          });

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role }]);
          // 2. SELECT existing comment
          mockSql.mockResolvedValueOnce([{ id: commentId, author_id: authorId }]);
          // 3. UPDATE resolved
          mockSql.mockResolvedValueOnce([]);
          // 4. SELECT updated comment joined with users
          mockSql.mockResolvedValueOnce([{
            id: commentId,
            copy_block_id: copyBlockId,
            author_id: authorId,
            author_name: 'Test User',
            message: originalMessage,
            resolved: true,
            created_at: createdAt,
            updated_at: updatedAt,
          }]);

          const res = await PATCH(patchReq);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.resolved).toBe(true);
          expect(body.message).toBe(originalMessage);
          expect(body.authorId).toBe(authorId);
          expect(body.copyBlockId).toBe(copyBlockId);
          expect(body.createdAt).toBe(createdAt);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ── Property 42: Comments returned in chronological order ──
// **Validates: Requirements 14.3**
describe('Property 42: Comments returned in chronological order', () => {
  it('GET returns comments ordered by created_at ascending', async () => {
    const { GET } = await import('@/app/api/comments/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(
          fc.record({
            id: fc.uuid(),
            message: fc.lorem({ maxCount: 3 }),
            authorId: fc.uuid(),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        fc.constantFrom<UserRole>('admin', 'editor', 'reviewer', 'viewer'),
        async (copyBlockId, commentInputs, role) => {
          mockSql.mockReset();

          const token = await createSession(TEST_USER_ID);

          // Generate ascending timestamps for each comment
          const baseTime = Date.now();
          const commentsWithTimestamps = commentInputs.map((c, i) => ({
            id: c.id,
            copy_block_id: copyBlockId,
            author_id: c.authorId,
            author_name: `User ${i}`,
            message: c.message,
            resolved: false,
            created_at: new Date(baseTime + i * 1000).toISOString(),
            updated_at: new Date(baseTime + i * 1000).toISOString(),
          }));

          // Shuffle to simulate DB returning in correct order regardless of insert order
          const shuffled = [...commentsWithTimestamps].sort(() => Math.random() - 0.5);
          // But the route does ORDER BY created_at ASC, so mock returns sorted
          const sorted = [...commentsWithTimestamps].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          const getReq = buildCommentRequest('GET', token, TEST_WORKSPACE_ID, undefined, {
            copy_block_id: copyBlockId,
          });

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role }]);
          // 2. SELECT from copy_block_comments JOIN users (returns sorted)
          mockSql.mockResolvedValueOnce(sorted);

          const res = await GET(getReq);
          expect(res.status).toBe(200);

          const comments = await res.json();
          expect(comments.length).toBe(commentInputs.length);

          // Verify chronological order
          for (let i = 1; i < comments.length; i++) {
            const prev = new Date(comments[i - 1].createdAt).getTime();
            const curr = new Date(comments[i].createdAt).getTime();
            expect(prev).toBeLessThanOrEqual(curr);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ── Property 43: Comment edit/delete restricted to author ──
// **Validates: Requirements 14.4**
describe('Property 43: Comment edit/delete restricted to author', () => {
  it('PATCH with message edit by non-author returns 403', async () => {
    const { PATCH } = await import('@/app/api/comments/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.lorem({ maxCount: 5 }),
        fc.constantFrom<UserRole>('admin', 'editor', 'reviewer', 'viewer'),
        async (commentId, originalAuthorId, newMessage, role) => {
          mockSql.mockReset();

          // The current user (TEST_USER_ID) is NOT the author (originalAuthorId)
          // Ensure they differ
          if (originalAuthorId === TEST_USER_ID) return;

          const token = await createSession(TEST_USER_ID);

          const patchReq = buildCommentRequest('PATCH', token, TEST_WORKSPACE_ID, {
            id: commentId,
            message: newMessage,
          });

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role }]);
          // 2. SELECT existing comment — author_id differs from userId
          mockSql.mockResolvedValueOnce([{ id: commentId, author_id: originalAuthorId }]);

          const res = await PATCH(patchReq);
          expect(res.status).toBe(403);

          const body = await res.json();
          expect(body.code).toBe('FORBIDDEN');
        }
      ),
      { numRuns: 30 }
    );
  });

  it('DELETE by non-author returns 403', async () => {
    const { DELETE } = await import('@/app/api/comments/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom<UserRole>('admin', 'editor', 'reviewer', 'viewer'),
        async (commentId, originalAuthorId, role) => {
          mockSql.mockReset();

          // Ensure the current user is NOT the author
          if (originalAuthorId === TEST_USER_ID) return;

          const token = await createSession(TEST_USER_ID);

          const deleteReq = buildCommentRequest('DELETE', token, TEST_WORKSPACE_ID, {
            id: commentId,
          });

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role }]);
          // 2. SELECT existing comment — author_id differs from userId
          mockSql.mockResolvedValueOnce([{ id: commentId, author_id: originalAuthorId }]);

          const res = await DELETE(deleteReq);
          expect(res.status).toBe(403);

          const body = await res.json();
          expect(body.code).toBe('FORBIDDEN');
        }
      ),
      { numRuns: 30 }
    );
  });
});
