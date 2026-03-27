/**
 * Property tests for Copy Block operations.
 *
 * Property 20: Copy block creation round-trip — create then fetch returns same fields
 * Property 21: Copy block edit persistence — update field then fetch returns updated value
 * Property 22: Copy block addition grows set — adding block increases count by 1
 * Property 23: Copy block format independence — changing format preserves content fields
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-copy-blocks-property-tests-minimum-length';
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
const COPY_SET_ID = 'copy-set-uuid';

const VALID_FORMATS = [
  'standard-hero', 'photo-forward', 'question-hook', 'stat-callout',
  'text-post', 'comparison', 'notes-app', 'notification', 'imessage', 'meme',
] as const;

// ── Arbitraries ──

const creativeFormatArb = fc.constantFrom(...VALID_FORMATS);

const copyBlockFieldsArb = fc.record({
  headline: fc.string({ minLength: 0, maxLength: 120 }),
  subhead: fc.string({ minLength: 0, maxLength: 200 }),
  primary_cta: fc.string({ minLength: 0, maxLength: 50 }),
  secondary_cta: fc.string({ minLength: 0, maxLength: 50 }),
});

// ── Helpers ──

function buildPostRequest(token: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/copy-blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-workspace-id': WORKSPACE_ID,
    },
    body: JSON.stringify(body),
  });
}

function buildGetByIdRequest(token: string, blockId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/copy-blocks/${blockId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-workspace-id': WORKSPACE_ID,
    },
  });
}

function buildPutRequest(token: string, blockId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/copy-blocks/${blockId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-workspace-id': WORKSPACE_ID,
    },
    body: JSON.stringify(body),
  });
}

function buildListRequest(token: string, copySetId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/copy-blocks?copy_set_id=${copySetId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-workspace-id': WORKSPACE_ID,
    },
  });
}

function fakeCopyBlockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? `block-${Date.now()}`,
    copy_set_id: overrides.copy_set_id ?? COPY_SET_ID,
    headline: overrides.headline ?? '',
    subhead: overrides.subhead ?? '',
    primary_cta: overrides.primary_cta ?? '',
    secondary_cta: overrides.secondary_cta ?? '',
    creative_format: overrides.creative_format ?? 'standard-hero',
    sort_order: overrides.sort_order ?? 0,
    approval_status: overrides.approval_status ?? 'pending',
    approved_by: overrides.approved_by ?? null,
    approved_at: overrides.approved_at ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}


// ── Property 20: Copy block creation round-trip ──
// **Validates: Requirements 7.1**
describe('Property 20: Copy block creation round-trip', () => {
  it('creating a copy block then fetching it by ID returns the same fields', async () => {
    const { POST } = await import('@/app/api/copy-blocks/route');
    const { GET } = await import('@/app/api/copy-blocks/[id]/route');

    await fc.assert(
      fc.asyncProperty(creativeFormatArb, async (format) => {
        mockSql.mockReset();

        const token = await createSession(EDITOR_USER_ID);
        const blockId = `block-${Date.now()}-${Math.random()}`;
        const row = fakeCopyBlockRow({ id: blockId, creative_format: format });

        // ── POST: create copy block ──
        const postReq = buildPostRequest(token, {
          copy_set_id: COPY_SET_ID,
          creative_format: format,
        });

        // 1. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. INSERT INTO copy_blocks RETURNING *
        mockSql.mockResolvedValueOnce([row]);

        const postRes = await POST(postReq);
        expect(postRes.status).toBe(201);
        const created = await postRes.json();

        // ── GET: fetch copy block by ID ──
        const getReq = buildGetByIdRequest(token, blockId);

        // 1. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT copy_block
        mockSql.mockResolvedValueOnce([row]);

        const getRes = await GET(getReq, { params: Promise.resolve({ id: blockId }) });
        expect(getRes.status).toBe(200);
        const fetched = await getRes.json();

        // Round-trip: all fields match
        expect(fetched.id).toBe(created.id);
        expect(fetched.copySetId).toBe(COPY_SET_ID);
        expect(fetched.headline).toBe(created.headline);
        expect(fetched.subhead).toBe(created.subhead);
        expect(fetched.primaryCta).toBe(created.primaryCta);
        expect(fetched.secondaryCta).toBe(created.secondaryCta);
        expect(fetched.creativeFormat).toBe(format);
        expect(fetched.approvalStatus).toBe('pending');
        expect(fetched.createdAt).toBeTruthy();
      }),
      { numRuns: 50 },
    );
  });
});

// ── Property 21: Copy block edit persistence ──
// **Validates: Requirements 7.2**
describe('Property 21: Copy block edit persistence', () => {
  it('updating a field then fetching returns the updated value', async () => {
    const { PUT, GET } = await import('@/app/api/copy-blocks/[id]/route');

    await fc.assert(
      fc.asyncProperty(copyBlockFieldsArb, async (fields) => {
        mockSql.mockReset();

        const token = await createSession(EDITOR_USER_ID);
        const blockId = `block-${Date.now()}-${Math.random()}`;
        const updatedRow = fakeCopyBlockRow({
          id: blockId,
          headline: fields.headline,
          subhead: fields.subhead,
          primary_cta: fields.primary_cta,
          secondary_cta: fields.secondary_cta,
        });

        // ── PUT: update copy block ──
        const putReq = buildPutRequest(token, blockId, fields);

        // 1. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. UPDATE copy_blocks RETURNING *
        mockSql.mockResolvedValueOnce([updatedRow]);

        const putRes = await PUT(putReq, { params: Promise.resolve({ id: blockId }) });
        expect(putRes.status).toBe(200);
        const updated = await putRes.json();

        // ── GET: fetch copy block by ID ──
        const getReq = buildGetByIdRequest(token, blockId);

        // 1. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT copy_block
        mockSql.mockResolvedValueOnce([updatedRow]);

        const getRes = await GET(getReq, { params: Promise.resolve({ id: blockId }) });
        expect(getRes.status).toBe(200);
        const fetched = await getRes.json();

        // Persistence: updated fields match
        expect(fetched.headline).toBe(fields.headline);
        expect(fetched.subhead).toBe(fields.subhead);
        expect(fetched.primaryCta).toBe(fields.primary_cta);
        expect(fetched.secondaryCta).toBe(fields.secondary_cta);
        expect(fetched.headline).toBe(updated.headline);
        expect(fetched.subhead).toBe(updated.subhead);
      }),
      { numRuns: 50 },
    );
  });
});


// ── Property 22: Copy block addition grows set ──
// **Validates: Requirements 7.3**
describe('Property 22: Copy block addition grows set', () => {
  it('adding a new copy block increases the set count by 1 and the new block has empty fields', async () => {
    const { POST, GET } = await import('@/app/api/copy-blocks/route');

    // Arbitrary: initial set size between 0 and 5
    const initialCountArb = fc.integer({ min: 0, max: 5 });

    await fc.assert(
      fc.asyncProperty(initialCountArb, async (initialCount) => {
        mockSql.mockReset();

        const token = await createSession(EDITOR_USER_ID);

        // Build existing rows for the initial set
        const existingRows = Array.from({ length: initialCount }, (_, i) =>
          fakeCopyBlockRow({ id: `existing-${i}`, sort_order: i }),
        );

        // ── GET: list copy blocks before adding ──
        const listBeforeReq = buildListRequest(token, COPY_SET_ID);

        // 1. requireRole
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT copy_blocks
        mockSql.mockResolvedValueOnce(existingRows);

        const listBeforeRes = await GET(listBeforeReq);
        expect(listBeforeRes.status).toBe(200);
        const before = await listBeforeRes.json();
        expect(before).toHaveLength(initialCount);

        // ── POST: add new empty copy block ──
        const newBlockId = `new-block-${Date.now()}`;
        const newRow = fakeCopyBlockRow({ id: newBlockId, sort_order: initialCount });

        const postReq = buildPostRequest(token, { copy_set_id: COPY_SET_ID });

        // 1. requireRole
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. INSERT RETURNING *
        mockSql.mockResolvedValueOnce([newRow]);

        const postRes = await POST(postReq);
        expect(postRes.status).toBe(201);
        const created = await postRes.json();

        // New block has empty content fields
        expect(created.headline).toBe('');
        expect(created.subhead).toBe('');
        expect(created.primaryCta).toBe('');
        expect(created.secondaryCta).toBe('');

        // ── GET: list copy blocks after adding ──
        const listAfterReq = buildListRequest(token, COPY_SET_ID);

        // 1. requireRole
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT copy_blocks (now includes the new one)
        mockSql.mockResolvedValueOnce([...existingRows, newRow]);

        const listAfterRes = await GET(listAfterReq);
        expect(listAfterRes.status).toBe(200);
        const after = await listAfterRes.json();

        // Count invariant: N + 1
        expect(after).toHaveLength(initialCount + 1);
      }),
      { numRuns: 30 },
    );
  });
});

// ── Property 23: Copy block format independence ──
// **Validates: Requirements 7.4**
describe('Property 23: Copy block format independence', () => {
  it('changing creative format preserves all content fields', async () => {
    const { PUT, GET } = await import('@/app/api/copy-blocks/[id]/route');

    // Arbitrary: content fields + two different formats
    const formatPairArb = fc.tuple(creativeFormatArb, creativeFormatArb);

    await fc.assert(
      fc.asyncProperty(copyBlockFieldsArb, formatPairArb, async (fields, [formatA, formatB]) => {
        mockSql.mockReset();

        const token = await createSession(EDITOR_USER_ID);
        const blockId = `block-${Date.now()}-${Math.random()}`;

        // Start with formatA and the given content fields
        const originalRow = fakeCopyBlockRow({
          id: blockId,
          headline: fields.headline,
          subhead: fields.subhead,
          primary_cta: fields.primary_cta,
          secondary_cta: fields.secondary_cta,
          creative_format: formatA,
        });

        // ── PUT: change format to formatB ──
        const afterFormatChange = { ...originalRow, creative_format: formatB };

        const putReq = buildPutRequest(token, blockId, { creative_format: formatB });

        // 1. requireRole
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. UPDATE RETURNING *
        mockSql.mockResolvedValueOnce([afterFormatChange]);

        const putRes = await PUT(putReq, { params: Promise.resolve({ id: blockId }) });
        expect(putRes.status).toBe(200);

        // ── GET: fetch and verify content preserved ──
        const getReq = buildGetByIdRequest(token, blockId);

        // 1. requireRole
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT
        mockSql.mockResolvedValueOnce([afterFormatChange]);

        const getRes = await GET(getReq, { params: Promise.resolve({ id: blockId }) });
        expect(getRes.status).toBe(200);
        const fetched = await getRes.json();

        // Format changed
        expect(fetched.creativeFormat).toBe(formatB);

        // Content fields preserved — format change is independent of content
        expect(fetched.headline).toBe(fields.headline);
        expect(fetched.subhead).toBe(fields.subhead);
        expect(fetched.primaryCta).toBe(fields.primary_cta);
        expect(fetched.secondaryCta).toBe(fields.secondary_cta);
      }),
      { numRuns: 50 },
    );
  });
});
