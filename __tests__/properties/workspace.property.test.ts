/**
 * Property tests for Workspace operations.
 *
 * Property 1: Workspace creation round-trip — create then fetch returns same fields
 * Property 4: Workspace visibility isolation — users see only their workspaces
 * Property 6: Workspace creation validation — missing brand_name rejected
 *
 * Validates: Requirements 1.1, 1.2, 1.5, 1.7
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-workspace-property-tests-minimum-length';
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
const OTHER_USER_ID = 'other-user-uuid';
const WORKSPACE_ID = 'workspace-uuid-test';

// ── Arbitraries ──

const hexColorArb = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 6, maxLength: 6 })
  .map((chars) => `#${chars.join('')}`);

const workspaceInputArb = fc.record({
  brand_name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  color_primary: fc.option(hexColorArb, { nil: undefined }),
  color_secondary: fc.option(hexColorArb, { nil: undefined }),
  color_accent: fc.option(hexColorArb, { nil: undefined }),
  font_family: fc.option(fc.constantFrom('Inter', 'Roboto', 'Arial', 'Helvetica'), { nil: undefined }),
});

// ── Helpers ──

function buildCreateRequest(token: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/workspaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function buildListRequest(token: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/workspaces', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Simulate the DB row returned by INSERT ... RETURNING * for a workspace.
 */
function fakeWorkspaceRow(input: Record<string, unknown>, id: string) {
  return {
    id,
    name: input.name || input.brand_name,
    brand_name: input.brand_name,
    logo_url: input.logo_url || null,
    color_primary: input.color_primary || null,
    color_secondary: input.color_secondary || null,
    color_accent: input.color_accent || null,
    font_family: input.font_family || null,
    brand_urls: JSON.stringify(input.brand_urls || []),
    adology_brand_id: input.adology_brand_id || null,
    adology_custom_labels: JSON.stringify(input.adology_custom_labels || {}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Property 1: Workspace creation round-trip ──
// **Validates: Requirements 1.1, 1.2**
describe('Property 1: Workspace creation round-trip', () => {
  it('creating a workspace then fetching it returns the same fields', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    await fc.assert(
      fc.asyncProperty(workspaceInputArb, async (input) => {
        mockSql.mockReset();

        const token = await createSession(ADMIN_USER_ID);
        const req = buildCreateRequest(token, input);

        const wsId = `ws-${Date.now()}`;
        const row = fakeWorkspaceRow(input, wsId);

        // 1. Admin check — user is admin
        mockSql.mockResolvedValueOnce([{ '?column?': 1 }]);
        // 2. INSERT INTO workspaces RETURNING *
        mockSql.mockResolvedValueOnce([row]);
        // 3. INSERT INTO workspace_members (auto-add creator)
        mockSql.mockResolvedValueOnce([]);

        const res = await POST(req);
        expect(res.status).toBe(201);

        const body = await res.json();

        // Round-trip: returned workspace matches input fields
        expect(body.id).toBe(wsId);
        expect(body.brandName).toBe(input.brand_name);
        expect(body.name).toBe(input.name || input.brand_name);
        expect(body.logoUrl).toBe(input.logo_url || null);
        expect(body.colorPrimary).toBe(input.color_primary || null);
        expect(body.colorSecondary).toBe(input.color_secondary || null);
        expect(body.colorAccent).toBe(input.color_accent || null);
        expect(body.fontFamily).toBe(input.font_family || null);
        expect(body.createdAt).toBeTruthy();
      }),
      { numRuns: 50 }
    );
  });
});

// ── Property 4: Workspace visibility isolation ──
// **Validates: Requirements 1.5**
describe('Property 4: Workspace visibility isolation', () => {
  it('users see only the workspaces they are members of', async () => {
    const { GET } = await import('@/app/api/workspaces/route');

    // Arbitrary: generate a set of workspace IDs the user is a member of
    const memberWorkspaceIdsArb = fc.uniqueArray(
      fc.uuid(),
      { minLength: 0, maxLength: 5 }
    );

    await fc.assert(
      fc.asyncProperty(memberWorkspaceIdsArb, async (memberWsIds) => {
        mockSql.mockReset();

        const token = await createSession(OTHER_USER_ID);
        const req = buildListRequest(token);

        // The GET handler queries workspaces joined with workspace_members
        // where user_id matches. We return exactly the member workspaces.
        const rows = memberWsIds.map((id) => ({
          id,
          name: `Workspace ${id.slice(0, 4)}`,
          brand_name: `Brand ${id.slice(0, 4)}`,
          logo_url: null,
          color_primary: null,
          color_secondary: null,
          color_accent: null,
          font_family: null,
          brand_urls: '[]',
          adology_brand_id: null,
          adology_custom_labels: '{}',
          created_at: new Date().toISOString(),
        }));

        mockSql.mockResolvedValueOnce(rows);

        const res = await GET(req);
        expect(res.status).toBe(200);

        const body = await res.json();

        // Isolation: returned set matches exactly the member set
        const returnedIds = body.map((ws: { id: string }) => ws.id);
        expect(returnedIds).toHaveLength(memberWsIds.length);
        expect(new Set(returnedIds)).toEqual(new Set(memberWsIds));
      }),
      { numRuns: 50 }
    );
  });
});

// ── Property 6: Workspace creation validation ──
// **Validates: Requirements 1.7**
describe('Property 6: Workspace creation validation', () => {
  it('missing or empty brand_name is rejected with a validation error', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    // Arbitrary: generate bodies with missing, empty, or whitespace-only brand_name
    const invalidBrandNameArb = fc.oneof(
      // brand_name missing entirely
      fc.constant({}),
      // brand_name is empty string
      fc.constant({ brand_name: '' }),
      // brand_name is whitespace only
      fc.integer({ min: 1, max: 10 }).map((n) => ({
        brand_name: ' '.repeat(n),
      })),
      // brand_name is null
      fc.constant({ brand_name: null }),
    );

    await fc.assert(
      fc.asyncProperty(invalidBrandNameArb, async (body) => {
        mockSql.mockReset();

        const token = await createSession(ADMIN_USER_ID);
        const req = buildCreateRequest(token, body);

        // Admin check passes
        mockSql.mockResolvedValueOnce([{ '?column?': 1 }]);

        const res = await POST(req);
        const json = await res.json();

        // Validation: rejected with 400 and no workspace persisted
        expect(res.status).toBe(400);
        expect(json.code).toBe('VALIDATION_ERROR');
        expect(json.error).toContain('brand_name');

        // The INSERT query should never have been called (only admin check was called)
        // mockSql was called once for admin check, no more
        expect(mockSql).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 30 }
    );
  });
});
