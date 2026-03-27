/**
 * Property tests for Workspace Member operations.
 *
 * Property 2: Workspace member association round-trip — add member then list includes them
 *
 * Validates: Requirements 1.3
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-workspace-members-property-tests-minimum-length';
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

const ADMIN_USER_ID = 'admin-user-uuid';
const VALID_ROLES: UserRole[] = ['admin', 'editor', 'reviewer', 'viewer'];

// ── Arbitraries ──

const roleArb = fc.constantFrom(...VALID_ROLES);
const uuidArb = fc.uuid();

// ── Helpers ──

function buildPostRequest(
  token: string,
  workspaceId: string,
  body: Record<string, unknown>
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/workspaces/${workspaceId}/members`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
      },
      body: JSON.stringify(body),
    }
  );
}

function buildGetRequest(token: string, workspaceId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/workspaces/${workspaceId}/members`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
      },
    }
  );
}

// ── Property 2: Workspace member association round-trip ──
// **Validates: Requirements 1.3**
describe('Property 2: Workspace member association round-trip', () => {
  it('adding a member then listing members includes them with the assigned role', async () => {
    const { POST, GET } = await import(
      '@/app/api/workspaces/[id]/members/route'
    );

    await fc.assert(
      fc.asyncProperty(uuidArb, uuidArb, roleArb, async (workspaceId, userId, role) => {
        mockSql.mockReset();

        const token = await createSession(ADMIN_USER_ID);
        const memberId = `member-${Date.now()}`;
        const createdAt = new Date().toISOString();

        // ── POST: add member ──
        const postReq = buildPostRequest(token, workspaceId, {
          user_id: userId,
          role,
        });

        // 1. requireRole membership check (admin)
        mockSql.mockResolvedValueOnce([{ role: 'admin' }]);
        // 2. User existence check
        mockSql.mockResolvedValueOnce([{ id: userId }]);
        // 3. Existing membership check (none)
        mockSql.mockResolvedValueOnce([]);
        // 4. INSERT INTO workspace_members RETURNING *
        mockSql.mockResolvedValueOnce([
          {
            id: memberId,
            workspace_id: workspaceId,
            user_id: userId,
            role,
            created_at: createdAt,
          },
        ]);

        const postRes = await POST(postReq, {
          params: Promise.resolve({ id: workspaceId }),
        });
        expect(postRes.status).toBe(201);

        const postBody = await postRes.json();
        expect(postBody.id).toBe(memberId);
        expect(postBody.workspaceId).toBe(workspaceId);
        expect(postBody.userId).toBe(userId);
        expect(postBody.role).toBe(role);
        expect(postBody.createdAt).toBe(createdAt);

        // ── GET: list members ──
        const getReq = buildGetRequest(token, workspaceId);

        // 1. requireRole membership check (any member)
        mockSql.mockResolvedValueOnce([{ role: 'admin' }]);
        // 2. SELECT members with JOIN on users
        mockSql.mockResolvedValueOnce([
          {
            id: memberId,
            workspace_id: workspaceId,
            user_id: userId,
            role,
            created_at: createdAt,
            email: `user-${userId.slice(0, 8)}@example.com`,
            display_name: `User ${userId.slice(0, 8)}`,
          },
        ]);

        const getRes = await GET(getReq, {
          params: Promise.resolve({ id: workspaceId }),
        });
        expect(getRes.status).toBe(200);

        const members = await getRes.json();

        // Round-trip: the added member appears in the list with the correct role
        const addedMember = members.find(
          (m: { userId: string }) => m.userId === userId
        );
        expect(addedMember).toBeDefined();
        expect(addedMember.role).toBe(role);
        expect(addedMember.workspaceId).toBe(workspaceId);
        expect(addedMember.user).toBeDefined();
        expect(addedMember.user.id).toBe(userId);
      }),
      { numRuns: 50 }
    );
  });
});
