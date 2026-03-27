/**
 * Property tests for Role-Based Access Control (RBAC).
 *
 * Property 3: Admin-only workspace creation — non-admin users rejected
 * Property 9: Role-based access control matrix — each role/action combination enforced correctly
 *
 * Validates: Requirements 1.4, 2.4
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest, NextResponse } from 'next/server';
import { createSession, hashPassword } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-rbac-property-tests-minimum-length';
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

const NON_ADMIN_ROLES: UserRole[] = ['editor', 'reviewer', 'viewer'];
const ALL_ROLES: UserRole[] = ['admin', 'editor', 'reviewer', 'viewer'];
const TEST_USER_ID = 'user-uuid-rbac-test';
const TEST_WORKSPACE_ID = 'workspace-uuid-rbac-test';

// ── Helpers ──

function buildWorkspaceCreateRequest(token: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/workspaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ brand_name: 'Test Brand' }),
  });
}

function buildAuthedRequest(
  url: string,
  method: string,
  token: string,
  workspaceId: string,
  body?: Record<string, unknown>
): NextRequest {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'x-workspace-id': workspaceId,
  };
  if (body) headers['Content-Type'] = 'application/json';

  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Configure mockSql to return a specific role for workspace membership lookup.
 * The mock uses a tagged template literal pattern — the first call to mockSql
 * is the membership check in requireRole.
 */
function mockMembershipWithRole(role: UserRole): void {
  mockSql.mockResolvedValueOnce([{ role }]);
}

/**
 * Configure mockSql to return no membership (user not in workspace).
 */
function mockNoMembership(): void {
  mockSql.mockResolvedValueOnce([]);
}

// ── Property 3: Admin-only workspace creation ──
// **Validates: Requirements 1.4**
describe('Property 3: Admin-only workspace creation', () => {
  it('non-admin users are rejected when attempting to create a workspace', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NON_ADMIN_ROLES),
        async (role) => {
          mockSql.mockReset();

          // Create a valid JWT for the test user
          const token = await createSession(TEST_USER_ID);
          const req = buildWorkspaceCreateRequest(token);

          // The workspace POST route first authenticates (verifySession),
          // then checks if user is admin in any workspace.
          // For non-admin roles, the admin check query returns no rows.
          mockSql.mockResolvedValueOnce([]); // admin check: no admin membership

          const res = await POST(req);
          const body = await res.json();

          expect(res.status).toBe(403);
          expect(body.code).toBe('FORBIDDEN');
          expect(body.error).toContain('admin');
        }
      ),
      { numRuns: 30 }
    );
  });

  it('admin users are allowed to create workspaces', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    // Create a valid JWT for the test user
    const token = await createSession(TEST_USER_ID);
    const req = buildWorkspaceCreateRequest(token);

    mockSql.mockReset();
    // admin check: user is admin
    mockSql.mockResolvedValueOnce([{ '?column?': 1 }]);
    // INSERT INTO workspaces RETURNING *
    mockSql.mockResolvedValueOnce([{
      id: 'new-ws-id',
      name: 'Test Brand',
      brand_name: 'Test Brand',
      logo_url: null,
      color_primary: null,
      color_secondary: null,
      color_accent: null,
      font_family: null,
      brand_urls: '[]',
      adology_brand_id: null,
      adology_custom_labels: '{}',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }]);
    // INSERT INTO workspace_members (auto-add creator as admin)
    mockSql.mockResolvedValueOnce([]);

    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});

// ── Property 9: Role-based access control matrix ──
// **Validates: Requirements 2.4**
describe('Property 9: Role-based access control matrix', () => {
  /**
   * Permission matrix from Requirement 2.4:
   * - admin: manage workspaces and team members
   * - editor: create/modify projects and ads
   * - reviewer: view and approve ads
   * - viewer: view ads only
   *
   * We test requireRole directly since it's the enforcement point for all routes.
   */

  // Define the access control matrix: which roles are allowed for each action category
  const ACCESS_MATRIX: { action: string; allowedRoles: UserRole[]; routeRoles: UserRole[] }[] = [
    {
      action: 'manage workspaces and members',
      allowedRoles: ['admin'],
      routeRoles: ['admin'],
    },
    {
      action: 'create/modify projects and ads',
      allowedRoles: ['admin', 'editor'],
      routeRoles: ['admin', 'editor'],
    },
    {
      action: 'view and approve ads',
      allowedRoles: ['admin', 'reviewer'],
      routeRoles: ['admin', 'reviewer'],
    },
    {
      action: 'view ads only',
      allowedRoles: ['admin', 'editor', 'reviewer', 'viewer'],
      routeRoles: ['admin', 'editor', 'reviewer', 'viewer'],
    },
  ];

  it('each role/action combination is enforced correctly per the permission matrix', async () => {
    const { requireRole } = await import('@/lib/auth');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_ROLES),
        fc.constantFrom(...ACCESS_MATRIX),
        async (userRole, { action, allowedRoles, routeRoles }) => {
          mockSql.mockReset();

          const token = await createSession(TEST_USER_ID);
          const req = buildAuthedRequest('/api/test', 'GET', token, TEST_WORKSPACE_ID);

          // Mock the membership query to return the user's role
          mockMembershipWithRole(userRole);

          const isAllowed = allowedRoles.includes(userRole);

          if (isAllowed) {
            // Should succeed — requireRole returns { userId, workspaceId }
            const result = await requireRole(req, routeRoles);
            expect(result.userId).toBe(TEST_USER_ID);
            expect(result.workspaceId).toBe(TEST_WORKSPACE_ID);
          } else {
            // Should throw a 403 FORBIDDEN response
            try {
              await requireRole(req, routeRoles);
              expect.fail(`requireRole should have thrown for role=${userRole} on action="${action}"`);
            } catch (error: unknown) {
              const res = error as NextResponse;
              expect(res.status).toBe(403);
              const body = await res.json();
              expect(body.code).toBe('FORBIDDEN');
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('non-members are always denied regardless of requested role', async () => {
    const { requireRole } = await import('@/lib/auth');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_ROLES),
        async (requestedRole) => {
          mockSql.mockReset();

          const token = await createSession(TEST_USER_ID);
          const req = buildAuthedRequest('/api/test', 'GET', token, TEST_WORKSPACE_ID);

          // User is not a member of the workspace
          mockNoMembership();

          try {
            await requireRole(req, [requestedRole]);
            expect.fail('requireRole should have thrown for non-member');
          } catch (error: unknown) {
            const res = error as NextResponse;
            expect(res.status).toBe(403);
            const body = await res.json();
            expect(body.code).toBe('FORBIDDEN');
            expect(body.error).toContain('Not a member');
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
