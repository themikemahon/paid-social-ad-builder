/**
 * Property tests for Project operations.
 *
 * Property 10: Project creation round-trip — create then fetch returns same fields
 * Property 11: Project workspace isolation — users see only current workspace's projects
 * Property 13: Empty project name validation — empty name rejected
 *
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-projects-property-tests-minimum-length';
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

const EDITOR_USER_ID = 'editor-user-uuid';
const WORKSPACE_A_ID = 'workspace-a-uuid';
const WORKSPACE_B_ID = 'workspace-b-uuid';

// ── Arbitraries ──

const projectInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  brief: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined }),
  objectives: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined }),
  strategy_overrides: fc.option(
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
      fc.string({ minLength: 0, maxLength: 100 }),
      { minKeys: 0, maxKeys: 3 }
    ),
    { nil: undefined }
  ),
});

// ── Helpers ──

function buildPostRequest(
  token: string,
  workspaceId: string,
  body: Record<string, unknown>
): NextRequest {
  return new NextRequest('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
    body: JSON.stringify(body),
  });
}

function buildListRequest(token: string, workspaceId: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/projects', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
  });
}

function buildGetByIdRequest(
  token: string,
  workspaceId: string,
  projectId: string
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/projects/${projectId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
      },
    }
  );
}

/**
 * Simulate the DB row returned by INSERT ... RETURNING * for a project.
 */
function fakeProjectRow(
  input: Record<string, unknown>,
  id: string,
  workspaceId: string
) {
  return {
    id,
    workspace_id: workspaceId,
    name: typeof input.name === 'string' ? input.name.trim() : input.name,
    brief: input.brief || null,
    objectives: input.objectives || null,
    strategy_overrides: JSON.stringify(input.strategy_overrides || {}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Property 10: Project creation round-trip ──
// **Validates: Requirements 3.1, 3.2**
describe('Property 10: Project creation round-trip', () => {
  it('creating a project then fetching it by ID returns the same fields', async () => {
    const { POST } = await import('@/app/api/projects/route');
    const { GET } = await import('@/app/api/projects/[id]/route');

    await fc.assert(
      fc.asyncProperty(projectInputArb, async (input) => {
        mockSql.mockReset();

        const token = await createSession(EDITOR_USER_ID);
        const projectId = `proj-${Date.now()}`;
        const row = fakeProjectRow(input, projectId, WORKSPACE_A_ID);

        // ── POST: create project ──
        const postReq = buildPostRequest(token, WORKSPACE_A_ID, input);

        // 1. requireRole membership check (editor)
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. INSERT INTO projects RETURNING *
        mockSql.mockResolvedValueOnce([row]);

        const postRes = await POST(postReq);
        expect(postRes.status).toBe(201);

        const created = await postRes.json();

        // ── GET: fetch project by ID ──
        const getReq = buildGetByIdRequest(token, WORKSPACE_A_ID, projectId);

        // 1. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT project
        mockSql.mockResolvedValueOnce([row]);
        // 3. SELECT project_personas
        mockSql.mockResolvedValueOnce([]);

        const getRes = await GET(getReq, {
          params: Promise.resolve({ id: projectId }),
        });
        expect(getRes.status).toBe(200);

        const fetched = await getRes.json();

        // Round-trip: all fields match
        expect(fetched.id).toBe(created.id);
        expect(fetched.workspaceId).toBe(WORKSPACE_A_ID);
        expect(fetched.name).toBe(created.name);
        expect(fetched.brief).toBe(created.brief);
        expect(fetched.objectives).toBe(created.objectives);
        expect(fetched.strategyOverrides).toEqual(created.strategyOverrides);
        expect(fetched.createdAt).toBeTruthy();
      }),
      { numRuns: 50 }
    );
  });
});


// ── Property 11: Project workspace isolation ──
// **Validates: Requirements 3.4**
describe('Property 11: Project workspace isolation', () => {
  it('users see only projects belonging to the current workspace', async () => {
    const { GET } = await import('@/app/api/projects/route');

    // Arbitrary: generate project IDs for two workspaces
    const projectIdsArb = fc.record({
      wsA: fc.uniqueArray(fc.uuid(), { minLength: 0, maxLength: 4 }),
      wsB: fc.uniqueArray(fc.uuid(), { minLength: 0, maxLength: 4 }),
    });

    await fc.assert(
      fc.asyncProperty(projectIdsArb, async ({ wsA, wsB }) => {
        mockSql.mockReset();

        const token = await createSession(EDITOR_USER_ID);

        // ── GET: list projects for workspace A ──
        const reqA = buildListRequest(token, WORKSPACE_A_ID);

        const rowsA = wsA.map((id) => ({
          id,
          workspace_id: WORKSPACE_A_ID,
          name: `Project ${id.slice(0, 4)}`,
          brief: null,
          objectives: null,
          strategy_overrides: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        // 1. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT projects WHERE workspace_id = wsA
        mockSql.mockResolvedValueOnce(rowsA);

        const resA = await GET(reqA);
        expect(resA.status).toBe(200);

        const bodyA = await resA.json();
        const returnedIdsA = bodyA.map((p: { id: string }) => p.id);

        // Isolation: only workspace A projects returned
        expect(returnedIdsA).toHaveLength(wsA.length);
        expect(new Set(returnedIdsA)).toEqual(new Set(wsA));
        // No workspace B project IDs should appear
        for (const bId of wsB) {
          expect(returnedIdsA).not.toContain(bId);
        }

        // ── GET: list projects for workspace B ──
        const reqB = buildListRequest(token, WORKSPACE_B_ID);

        const rowsB = wsB.map((id) => ({
          id,
          workspace_id: WORKSPACE_B_ID,
          name: `Project ${id.slice(0, 4)}`,
          brief: null,
          objectives: null,
          strategy_overrides: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        // 1. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT projects WHERE workspace_id = wsB
        mockSql.mockResolvedValueOnce(rowsB);

        const resB = await GET(reqB);
        expect(resB.status).toBe(200);

        const bodyB = await resB.json();
        const returnedIdsB = bodyB.map((p: { id: string }) => p.id);

        // Isolation: only workspace B projects returned
        expect(returnedIdsB).toHaveLength(wsB.length);
        expect(new Set(returnedIdsB)).toEqual(new Set(wsB));
        // No workspace A project IDs should appear
        for (const aId of wsA) {
          expect(returnedIdsB).not.toContain(aId);
        }
      }),
      { numRuns: 50 }
    );
  });
});

// ── Property 13: Empty project name validation ──
// **Validates: Requirements 3.5**
describe('Property 13: Empty project name validation', () => {
  it('empty or whitespace-only name is rejected with a validation error', async () => {
    const { POST } = await import('@/app/api/projects/route');

    // Arbitrary: generate bodies with empty or whitespace-only names
    const invalidNameArb = fc.oneof(
      // name is empty string
      fc.constant({ name: '' }),
      // name is whitespace only
      fc.integer({ min: 1, max: 10 }).map((n) => ({
        name: ' '.repeat(n),
      })),
      // name is null
      fc.constant({ name: null }),
      // name is missing entirely
      fc.constant({ brief: 'some brief' }),
    );

    await fc.assert(
      fc.asyncProperty(invalidNameArb, async (body) => {
        mockSql.mockReset();

        const token = await createSession(EDITOR_USER_ID);
        const req = buildPostRequest(token, WORKSPACE_A_ID, body);

        // 1. requireRole membership check (editor)
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);

        const res = await POST(req);
        const json = await res.json();

        // Validation: rejected with 400 VALIDATION_ERROR
        expect(res.status).toBe(400);
        expect(json.code).toBe('VALIDATION_ERROR');
        expect(json.error).toContain('name');

        // No INSERT should have been called — only the requireRole check
        expect(mockSql).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 30 }
    );
  });
});
