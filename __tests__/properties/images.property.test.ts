/**
 * Property tests for Image Asset Management.
 *
 * Property 44: Image upload round-trip — upload then fetch returns entry with blob URL
 * Property 45: Image removal cleans up — remove then fetch returns no entries
 * Property 46: Aspect ratio detection selects closest match — correct ratio selected per platform
 *
 * Validates: Requirements 15.1, 15.2, 15.4, 15.5
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { PLATFORM_ASPECT_RATIOS } from '@/lib/types';
import type { SocialPlatform } from '@/lib/types';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-images-property-tests-minimum-length';
});

// ── Mocks ──

const mockSql = vi.fn();
vi.mock('@/lib/db', () => ({
  getDb: () => mockSql,
}));

const mockPut = vi.fn();
const mockDel = vi.fn();
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

beforeEach(() => {
  mockSql.mockReset();
  mockPut.mockReset();
  mockDel.mockReset();
});

// ── Constants ──

const EDITOR_USER_ID = 'editor-user-uuid-images';
const WORKSPACE_ID = 'workspace-uuid-images';

// ── Arbitraries ──

const platformArb = fc.constantFrom<SocialPlatform>('linkedin', 'meta', 'reddit');

const imageFileArb = fc.constantFrom(
  { ext: 'png', mime: 'image/png' },
  { ext: 'jpeg', mime: 'image/jpeg' }
);

const imageDimensionsArb = fc.record({
  width: fc.integer({ min: 100, max: 4000 }),
  height: fc.integer({ min: 100, max: 4000 }),
});

// ── Helpers ──

/**
 * Build a minimal valid PNG file header with given dimensions.
 * PNG IHDR chunk stores width at bytes 16-19 and height at bytes 20-23 (big-endian).
 */
function buildPngBytes(width: number, height: number): Uint8Array {
  const data = new Uint8Array(24);
  // PNG signature
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR chunk length (13 bytes)
  data.set([0x00, 0x00, 0x00, 0x0d], 8);
  // IHDR chunk type
  data.set([0x49, 0x48, 0x44, 0x52], 12);
  // Width (big-endian)
  data[16] = (width >> 24) & 0xff;
  data[17] = (width >> 16) & 0xff;
  data[18] = (width >> 8) & 0xff;
  data[19] = width & 0xff;
  // Height (big-endian)
  data[20] = (height >> 24) & 0xff;
  data[21] = (height >> 16) & 0xff;
  data[22] = (height >> 8) & 0xff;
  data[23] = height & 0xff;
  return data;
}

function buildUploadRequest(
  token: string,
  workspaceId: string,
  file: File,
  copyBlockId: string,
  platform: SocialPlatform
): NextRequest {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('copy_block_id', copyBlockId);
  formData.append('platform', platform);

  return new NextRequest('http://localhost:3000/api/copy-block-images', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
    body: formData,
  });
}

function buildGetRequest(
  token: string,
  workspaceId: string,
  copyBlockId: string
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/copy-block-images?copy_block_id=${copyBlockId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
      },
    }
  );
}

function buildDeleteRequest(
  token: string,
  workspaceId: string,
  imageId: string
): NextRequest {
  return new NextRequest('http://localhost:3000/api/copy-block-images', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
    },
    body: JSON.stringify({ id: imageId }),
  });
}

function fakeImageRow(
  id: string,
  copyBlockId: string,
  blobUrl: string,
  aspectRatio: string | null,
  platform: SocialPlatform
) {
  return {
    id,
    copy_block_id: copyBlockId,
    blob_url: blobUrl,
    aspect_ratio: aspectRatio,
    platform,
    created_at: new Date().toISOString(),
  };
}

// ── Property 44: Image upload round-trip ──
// Feature: paid-social-ad-builder, Property 44: Image upload round-trip
// **Validates: Requirements 15.1, 15.2**
describe('Property 44: Image upload round-trip', () => {
  it('uploading an image then fetching returns entry with blob URL', async () => {
    const { POST, GET } = await import('@/app/api/copy-block-images/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        platformArb,
        imageFileArb,
        imageDimensionsArb,
        async (copyBlockId, platform, fileType, dims) => {
          mockSql.mockReset();
          mockPut.mockReset();

          const token = await createSession(EDITOR_USER_ID);
          const filename = `test-image.${fileType.ext}`;
          const pngBytes = buildPngBytes(dims.width, dims.height);
          const file = new File([pngBytes], filename, { type: fileType.mime });
          const blobUrl = `https://blob.example.com/copy-block-images/${copyBlockId}`;
          const imageId = `img-${Date.now()}`;

          // Compute expected aspect ratio
          const { detectAspectRatio } = await import('@/app/api/copy-block-images/route');
          const expectedRatio = detectAspectRatio(dims.width, dims.height, platform);

          const row = fakeImageRow(imageId, copyBlockId, blobUrl, expectedRatio, platform);

          // ── POST: upload image ──
          const postReq = buildUploadRequest(token, WORKSPACE_ID, file, copyBlockId, platform);

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
          // 2. put returns blob URL
          mockPut.mockResolvedValueOnce({ url: blobUrl });
          // 3. INSERT INTO copy_block_images RETURNING *
          mockSql.mockResolvedValueOnce([row]);

          const postRes = await POST(postReq);
          expect(postRes.status).toBe(201);

          const created = await postRes.json();
          expect(created.blobUrl).toBe(blobUrl);
          expect(created.copyBlockId).toBe(copyBlockId);
          expect(created.platform).toBe(platform);

          // ── GET: fetch images for copy block ──
          const getReq = buildGetRequest(token, WORKSPACE_ID, copyBlockId);

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
          // 2. SELECT copy_block_images
          mockSql.mockResolvedValueOnce([row]);

          const getRes = await GET(getReq);
          expect(getRes.status).toBe(200);

          const listed = await getRes.json();
          expect(listed).toHaveLength(1);
          expect(listed[0].id).toBe(imageId);
          expect(listed[0].blobUrl).toBe(blobUrl);
          expect(listed[0].copyBlockId).toBe(copyBlockId);
          expect(listed[0].platform).toBe(platform);
          expect(listed[0].createdAt).toBeTruthy();
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── Property 45: Image removal cleans up ──
// Feature: paid-social-ad-builder, Property 45: Image removal cleans up
// **Validates: Requirements 15.4**
describe('Property 45: Image removal cleans up', () => {
  it('removing an image then fetching returns no entries', async () => {
    const { DELETE, GET } = await import('@/app/api/copy-block-images/route');

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        platformArb,
        async (imageId, copyBlockId, platform) => {
          mockSql.mockReset();
          mockDel.mockReset();

          const token = await createSession(EDITOR_USER_ID);
          const blobUrl = `https://blob.example.com/copy-block-images/${imageId}`;
          const row = fakeImageRow(imageId, copyBlockId, blobUrl, '1/1', platform);

          // ── DELETE: remove image ──
          const delReq = buildDeleteRequest(token, WORKSPACE_ID, imageId);

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
          // 2. SELECT existing image
          mockSql.mockResolvedValueOnce([row]);
          // 3. DELETE FROM copy_block_images
          mockSql.mockResolvedValueOnce([]);

          mockDel.mockResolvedValueOnce(undefined);

          const delRes = await DELETE(delReq);
          expect(delRes.status).toBe(200);

          const delBody = await delRes.json();
          expect(delBody.ok).toBe(true);

          // ── GET: fetch images — should be empty ──
          const getReq = buildGetRequest(token, WORKSPACE_ID, copyBlockId);

          // 1. requireRole membership check
          mockSql.mockResolvedValueOnce([{ role: 'editor' }]);
          // 2. SELECT copy_block_images — empty
          mockSql.mockResolvedValueOnce([]);

          const getRes = await GET(getReq);
          expect(getRes.status).toBe(200);

          const listed = await getRes.json();
          expect(listed).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── Property 46: Aspect ratio detection selects closest match ──
// Feature: paid-social-ad-builder, Property 46: Aspect ratio detection selects closest match
// **Validates: Requirements 15.5**
describe('Property 46: Aspect ratio detection selects closest match', () => {
  it('detected aspect ratio is the platform ratio minimizing absolute difference', async () => {
    const { detectAspectRatio } = await import('@/app/api/copy-block-images/route');

    function parseRatio(ratio: string): number {
      const parts = ratio.split('/');
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }

    await fc.assert(
      fc.property(
        imageDimensionsArb,
        platformArb,
        (dims, platform) => {
          const result = detectAspectRatio(dims.width, dims.height, platform);
          const actual = dims.width / dims.height;
          const ratios = PLATFORM_ASPECT_RATIOS[platform];

          // Result must be one of the platform's valid ratios
          expect(ratios).toContain(result);

          // Result must minimize absolute difference
          const resultDiff = Math.abs(actual - parseRatio(result));
          for (const ratio of ratios) {
            const diff = Math.abs(actual - parseRatio(ratio));
            // The selected ratio should have a diff <= any other ratio's diff
            expect(resultDiff).toBeLessThanOrEqual(diff + 1e-10); // small epsilon for float precision
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
