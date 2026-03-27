/**
 * Property tests for Strategy Document operations.
 *
 * Property 16: Strategy document round-trip — upload then list includes correct metadata
 * Property 17: Strategy document size limit — files >10MB rejected
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest } from 'next/server';
import { createSession } from '@/lib/auth';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-strategy-docs-property-tests-minimum-length';
});

// ── Mocks ──

const mockSql = vi.fn();
vi.mock('@/lib/db', () => ({
  getDb: () => mockSql,
}));

const mockPut = vi.fn();
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockPut(...args),
}));

beforeEach(() => {
  mockSql.mockReset();
  mockPut.mockReset();
});

// ── Constants ──

const EDITOR_USER_ID = 'editor-user-uuid';
const WORKSPACE_ID = 'workspace-uuid';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── File type definitions ──

const FILE_TYPES = [
  { ext: 'pdf', mime: 'application/pdf' },
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { ext: 'txt', mime: 'text/plain' },
] as const;

// ── Arbitraries ──

const fileTypeArb = fc.constantFrom(...FILE_TYPES);

const filenameBaseArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0 && !/[/\\]/.test(s) && !s.includes('.'));

const strategyDocArb = fc.record({
  filenameBase: filenameBaseArb,
  fileType: fileTypeArb,
  contentSize: fc.integer({ min: 1, max: 1024 }), // small content for speed
  projectId: fc.option(fc.uuid(), { nil: null }),
});

// ── Helpers ──

function buildUploadRequest(
  token: string,
  workspaceId: string,
  file: File,
  projectId?: string | null
): NextRequest {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId) formData.append('project_id', projectId);

  return new NextRequest('http://localhost:3000/api/strategy-docs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
    body: formData,
  });
}

function buildListRequest(
  token: string,
  workspaceId: string,
  projectId?: string | null
): NextRequest {
  const url = projectId
    ? `http://localhost:3000/api/strategy-docs?project_id=${projectId}`
    : 'http://localhost:3000/api/strategy-docs';
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
  });
}

function fakeStrategyDocRow(
  id: string,
  workspaceId: string,
  projectId: string | null,
  filename: string,
  fileType: string,
  blobUrl: string,
  fileSizeBytes: number
) {
  return {
    id,
    workspace_id: workspaceId,
    project_id: projectId,
    filename,
    file_type: fileType,
    blob_url: blobUrl,
    file_size_bytes: fileSizeBytes,
    uploaded_by: EDITOR_USER_ID,
    created_at: new Date().toISOString(),
  };
}

// ── Property 16: Strategy document round-trip ──
// **Validates: Requirements 5.1, 5.2, 5.3**
describe('Property 16: Strategy document round-trip', () => {
  it('uploading a strategy document then listing includes correct metadata', async () => {
    const { POST, GET } = await import('@/app/api/strategy-docs/route');

    await fc.assert(
      fc.asyncProperty(strategyDocArb, async ({ filenameBase, fileType, contentSize, projectId }) => {
        mockSql.mockReset();
        mockPut.mockReset();

        const token = await createSession(EDITOR_USER_ID);
        const filename = `${filenameBase}.${fileType.ext}`;
        const content = new Uint8Array(contentSize);
        const file = new File([content], filename, { type: fileType.mime });
        const blobUrl = `https://blob.example.com/strategy-docs/${WORKSPACE_ID}/${filename}`;
        const docId = `doc-${Date.now()}`;

        const row = fakeStrategyDocRow(
          docId,
          WORKSPACE_ID,
          projectId,
          filename,
          fileType.ext,
          blobUrl,
          contentSize
        );

        // ── POST: upload strategy document ──
        const postReq = buildUploadRequest(token, WORKSPACE_ID, file, projectId);

        // 1. requireRole membership check (editor)
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. put returns blob URL
        mockPut.mockResolvedValueOnce({ url: blobUrl });
        // 3. INSERT INTO strategy_documents RETURNING *
        mockSql.mockResolvedValueOnce([row]);

        const postRes = await POST(postReq);
        expect(postRes.status).toBe(201);

        const created = await postRes.json();

        // ── GET: list strategy documents ──
        const getReq = buildListRequest(token, WORKSPACE_ID, projectId);

        // 1. requireRole membership check
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
        // 2. SELECT strategy_documents
        mockSql.mockResolvedValueOnce([row]);

        const getRes = await GET(getReq);
        expect(getRes.status).toBe(200);

        const listed = await getRes.json();

        // Round-trip: listed documents include the uploaded document
        expect(listed).toHaveLength(1);
        const doc = listed[0];
        expect(doc.id).toBe(created.id);
        expect(doc.workspaceId).toBe(WORKSPACE_ID);
        expect(doc.projectId).toBe(projectId ?? null);
        expect(doc.filename).toBe(filename);
        expect(doc.fileType).toBe(fileType.ext);
        expect(doc.blobUrl).toBe(blobUrl);
        expect(doc.fileSizeBytes).toBe(contentSize);
        expect(doc.createdAt).toBeTruthy();
      }),
      { numRuns: 50 }
    );
  });
});

// ── Property 17: Strategy document size limit ──
// **Validates: Requirements 5.4**
describe('Property 17: Strategy document size limit', () => {
  it('files exceeding 10MB are rejected with a validation error', async () => {
    const { POST } = await import('@/app/api/strategy-docs/route');

    // Generate sizes just over 10MB to keep memory usage low
    const oversizeArb = fc.record({
      overageBytes: fc.integer({ min: 1, max: 1000 }),
      fileType: fileTypeArb,
      filenameBase: filenameBaseArb,
    });

    await fc.assert(
      fc.asyncProperty(oversizeArb, async ({ overageBytes, fileType, filenameBase }) => {
        mockSql.mockReset();
        mockPut.mockReset();

        const token = await createSession(EDITOR_USER_ID);
        const fileSize = MAX_FILE_SIZE + overageBytes;
        const filename = `${filenameBase}.${fileType.ext}`;

        // Create a file with the oversized content
        const content = new Uint8Array(fileSize);
        const file = new File([content], filename, { type: fileType.mime });

        const req = buildUploadRequest(token, WORKSPACE_ID, file);

        // 1. requireRole membership check (editor)
        mockSql.mockResolvedValueOnce([{ role: 'editor' }]);

        const res = await POST(req);
        const json = await res.json();

        // Rejected with 400 VALIDATION_ERROR
        expect(res.status).toBe(400);
        expect(json.code).toBe('VALIDATION_ERROR');
        expect(json.error).toContain('10 MB');

        // put should NOT have been called (no blob upload)
        expect(mockPut).not.toHaveBeenCalled();

        // mockSql should only have been called once (for requireRole)
        expect(mockSql).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 50 }
    );
  });
});
