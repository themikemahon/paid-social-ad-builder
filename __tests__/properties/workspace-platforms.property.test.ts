/**
 * Property tests for Workspace Platform configuration.
 *
 * Property 5: Workspace platform configuration round-trip — enable platform then fetch includes it
 *
 * Validates: Requirements 1.6
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth';
import type { SocialPlatform } from '@/lib/types';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-workspace-platforms-property-tests-minimum-length';
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
const VALID_PLATFORMS: SocialPlatform[] = ['linkedin', 'meta', 'reddit'];

// ── Arbitraries ──

const platformArb = fc.constantFrom(...VALID_PLATFORMS);
const uuidArb = fc.uuid();
const configArb = fc.record({
  adAccountId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  pageId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

// ── Helpers ──

function buildPutRequest(
  token: string,
  workspaceId: string,
  body: Record<string, unknown>
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/workspaces/${workspaceId}/platforms`,
    {
      method: 'PUT',
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
    `http://localhost:3000/api/workspaces/${workspaceId}/platforms`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
      },
    }
  );
}

// ── Property 5: Workspace platform configuration round-trip ──
// **Validates: Requirements 1.6**
describe('Property 5: Workspace platform configuration round-trip', () => {
  it('enabling a platform then fetching platforms includes it as enabled', async () => {
    const { PUT, GET } = await import(
      '@/app/api/workspaces/[id]/platforms/route'
    );

    await fc.assert(
      fc.asyncProperty(uuidArb, platformArb, configArb, async (workspaceId, platform, config) => {
        mockSql.mockReset();

        const token = await createSession(ADMIN_USER_ID);
        const platformId = `platform-${Date.now()}`;
        const configJson = JSON.stringify(config);

        // ── PUT: enable platform ──
        const putReq = buildPutRequest(token, workspaceId, {
          platform,
          enabled: true,
          config,
        });

        // 1. requireRole membership check (admin)
        mockSql.mockResolvedValueOnce([{ role: 'admin' }]);
        // 2. UPSERT workspace_platforms RETURNING *
        mockSql.mockResolvedValueOnce([
          {
            id: platformId,
            workspace_id: workspaceId,
            platform,
            config,
            enabled: true,
          },
        ]);

        const putRes = await PUT(putReq, {
          params: Promise.resolve({ id: workspaceId }),
        });
        expect(putRes.status).toBe(200);

        const putBody = await putRes.json();
        expect(putBody.id).toBe(platformId);
        expect(putBody.workspaceId).toBe(workspaceId);
        expect(putBody.platform).toBe(platform);
        expect(putBody.enabled).toBe(true);

        // ── GET: list platforms ──
        const getReq = buildGetRequest(token, workspaceId);

        // 1. requireRole membership check (any member)
        mockSql.mockResolvedValueOnce([{ role: 'admin' }]);
        // 2. SELECT platforms
        mockSql.mockResolvedValueOnce([
          {
            id: platformId,
            workspace_id: workspaceId,
            platform,
            config,
            enabled: true,
          },
        ]);

        const getRes = await GET(getReq, {
          params: Promise.resolve({ id: workspaceId }),
        });
        expect(getRes.status).toBe(200);

        const platforms = await getRes.json();

        // Round-trip: the enabled platform appears in the list
        const found = platforms.find(
          (p: { platform: string }) => p.platform === platform
        );
        expect(found).toBeDefined();
        expect(found.enabled).toBe(true);
        expect(found.workspaceId).toBe(workspaceId);
        expect(found.config).toEqual(config);
      }),
      { numRuns: 50 }
    );
  });
});
