/**
 * Property tests for Audience Persona operations.
 *
 * Property 14: Audience persona round-trip — create then fetch returns same fields
 *
 * Validates: Requirements 4.1, 4.2
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-personas-property-tests-minimum-length';
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
const WORKSPACE_ID = 'workspace-uuid';

// ── Arbitraries ──

const personaInputArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  demographics: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
    fc.string({ minLength: 0, maxLength: 100 }),
    { minKeys: 0, maxKeys: 3 }
  ),
  pain_points: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
  motivations: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
  platform_behavior: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
    fc.string({ minLength: 0, maxLength: 100 }),
    { minKeys: 0, maxKeys: 3 }
  ),
});

// ── Helpers ──

function buildPostRequest(
  token: string,
  workspaceId: string,
  body: Record<string, unknown>
): NextRequest {
  return new NextRequest('http://localhost:3000/api/personas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
    body: JSON.stringify(body),
  });
}

function buildGetByIdRequest(
  token: string,
  workspaceId: string,
  personaId: string
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/personas/${personaId}`,
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
 * Simulate the DB row returned by INSERT ... RETURNING * for a persona.
 */
function fakePersonaRow(
  input: Record<string, unknown>,
  id: string,
  workspaceId: string
) {
  return {
    id,
    workspace_id: workspaceId,
    name: typeof input.name === 'string' ? input.name.trim() : input.name,
    demographics: JSON.stringify(input.demographics || {}),
    pain_points: input.pain_points || [],
    motivations: input.motivations || [],
    platform_behavior: JSON.stringify(input.platform_behavior || {}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Property 14: Audience persona round-trip ──
// **Validates: Requirements 4.1, 4.2**
describe('Property 14: Audience persona round-trip', () => {
  it('creating a persona then fetching it by ID returns the same fields', async () => {
    const { POST } = await import('@/app/api/personas/route');
    const { GET } = await import('@/app/api/personas/[id]/route');

    await fc.assert(
      fc.asyncProperty(personaInputArb, async (input) => {
        mockSql.mockReset();

        const token = await createSession(EDITOR_USER_ID);
        const personaId = `persona-${Date.now()}`;
        const row = fakePersonaRow(input, personaId, WORKSPACE_ID);

        // ── POST: create persona ──
        const postReq = buildPostRequest(token, WORKSPACE_ID, input);

        // 1. requireRole membership check (editor)
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. INSERT INTO audience_personas RETURNING *
        mockSql.mockResolvedValueOnce([row]);

        const postRes = await POST(postReq);
        expect(postRes.status).toBe(201);

        const created = await postRes.json();

        // ── GET: fetch persona by ID ──
        const getReq = buildGetByIdRequest(token, WORKSPACE_ID, personaId);

        // 3. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 4. SELECT persona
        mockSql.mockResolvedValueOnce([row]);

        const getRes = await GET(getReq, {
          params: Promise.resolve({ id: personaId }),
        });
        expect(getRes.status).toBe(200);

        const fetched = await getRes.json();

        // Round-trip: all fields match
        expect(fetched.id).toBe(created.id);
        expect(fetched.workspaceId).toBe(WORKSPACE_ID);
        expect(fetched.name).toBe(created.name);
        expect(fetched.demographics).toEqual(created.demographics);
        expect(fetched.painPoints).toEqual(created.painPoints);
        expect(fetched.motivations).toEqual(created.motivations);
        expect(fetched.platformBehavior).toEqual(created.platformBehavior);
        expect(fetched.createdAt).toBeTruthy();
        expect(fetched.updatedAt).toBeTruthy();
      }),
      { numRuns: 50 }
    );
  });
});
