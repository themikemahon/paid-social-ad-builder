import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { PLATFORM_ASPECT_RATIOS } from '@/lib/types';
import type { SocialPlatform } from '@/lib/types';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg'];

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    copyBlockId: row.copy_block_id,
    blobUrl: row.blob_url,
    aspectRatio: row.aspect_ratio ?? null,
    platform: row.platform ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Parse a ratio string like "1.91/1" or "9/16" into a numeric value.
 */
function parseRatio(ratio: string): number {
  const parts = ratio.split('/');
  return parseFloat(parts[0]) / parseFloat(parts[1]);
}

/**
 * Detect the closest platform-specific aspect ratio for given image dimensions.
 */
function detectAspectRatio(
  width: number,
  height: number,
  platform: SocialPlatform
): string {
  const actual = width / height;
  const ratios = PLATFORM_ASPECT_RATIOS[platform];
  let closest = ratios[0];
  let minDiff = Math.abs(actual - parseRatio(ratios[0]));

  for (let i = 1; i < ratios.length; i++) {
    const diff = Math.abs(actual - parseRatio(ratios[i]));
    if (diff < minDiff) {
      minDiff = diff;
      closest = ratios[i];
    }
  }

  return closest;
}

/**
 * GET /api/copy-block-images — list images for a copy block.
 * Query param: ?copy_block_id=<uuid> (required)
 * Optional: ?platform=<linkedin|meta|reddit>
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const sql = getDb();

    const copyBlockId = request.nextUrl.searchParams.get('copy_block_id');
    if (!copyBlockId) {
      return apiError(400, 'VALIDATION_ERROR', 'copy_block_id query parameter is required');
    }

    const platform = request.nextUrl.searchParams.get('platform') as SocialPlatform | null;

    let rows;
    if (platform) {
      rows = await sql`
        SELECT * FROM copy_block_images
        WHERE copy_block_id = ${copyBlockId} AND platform = ${platform}
        ORDER BY created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT * FROM copy_block_images
        WHERE copy_block_id = ${copyBlockId}
        ORDER BY created_at DESC
      `;
    }

    return NextResponse.json(rows.map(mapRow));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list images');
  }
}

/**
 * POST /api/copy-block-images — upload an image for a copy block.
 * Expects multipart form data with:
 *   - file: PNG or JPEG image
 *   - copy_block_id: UUID of the copy block
 *   - platform: social platform (linkedin, meta, reddit)
 * Aspect ratio is auto-detected from image dimensions.
 */
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const copyBlockId = formData.get('copy_block_id') as string | null;
    const platform = formData.get('platform') as SocialPlatform | null;

    if (!file) {
      return apiError(400, 'VALIDATION_ERROR', 'file is required');
    }
    if (!copyBlockId) {
      return apiError(400, 'VALIDATION_ERROR', 'copy_block_id is required');
    }
    if (!platform || !['linkedin', 'meta', 'reddit'].includes(platform)) {
      return apiError(400, 'VALIDATION_ERROR', 'platform must be one of: linkedin, meta, reddit');
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      // Fallback: check extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
        return apiError(400, 'VALIDATION_ERROR', 'Invalid file type. Accepted: PNG, JPEG');
      }
    }

    // Read image to detect dimensions for aspect ratio
    const arrayBuffer = await file.arrayBuffer();
    const dimensions = getImageDimensions(new Uint8Array(arrayBuffer), file.type, file.name);
    let aspectRatio: string | null = null;
    if (dimensions) {
      aspectRatio = detectAspectRatio(dimensions.width, dimensions.height, platform);
    }

    // Upload to Vercel Blob
    const blob = await put(
      `copy-block-images/${workspaceId}/${copyBlockId}-${Date.now()}.${file.name.split('.').pop()}`,
      file,
      { access: 'public' }
    );

    // Store metadata
    const sql = getDb();
    const rows = await sql`
      INSERT INTO copy_block_images (copy_block_id, blob_url, aspect_ratio, platform)
      VALUES (${copyBlockId}, ${blob.url}, ${aspectRatio}, ${platform})
      RETURNING *
    `;

    return NextResponse.json(mapRow(rows[0]), { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to upload image');
  }
}

/**
 * DELETE /api/copy-block-images — remove an image.
 * Expects JSON body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor']);

    const body = await request.json();
    const imageId = body.id as string | undefined;
    if (!imageId) {
      return apiError(400, 'VALIDATION_ERROR', 'id is required');
    }

    const sql = getDb();

    // Fetch existing record
    const existing = await sql`
      SELECT * FROM copy_block_images WHERE id = ${imageId}
    `;
    if (existing.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Image not found');
    }

    // Delete blob
    try {
      await del(existing[0].blob_url);
    } catch (_) {
      // Best-effort blob cleanup
    }

    // Delete database record
    await sql`DELETE FROM copy_block_images WHERE id = ${imageId}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete image');
  }
}

/**
 * Extract image dimensions from raw bytes by reading PNG/JPEG headers.
 */
function getImageDimensions(
  data: Uint8Array,
  mimeType: string,
  filename: string
): { width: number; height: number } | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const isPng = mimeType === 'image/png' || ext === 'png';
  const isJpeg = mimeType === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg';

  if (isPng && data.length >= 24) {
    // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
    const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
    const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
    if (width > 0 && height > 0) return { width, height };
  }

  if (isJpeg && data.length >= 2) {
    // JPEG: scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
    let offset = 2;
    while (offset < data.length - 9) {
      if (data[offset] === 0xff) {
        const marker = data[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          const height = (data[offset + 5] << 8) | data[offset + 6];
          const width = (data[offset + 7] << 8) | data[offset + 8];
          if (width > 0 && height > 0) return { width, height };
        }
        // Skip to next marker
        const segLen = (data[offset + 2] << 8) | data[offset + 3];
        offset += 2 + segLen;
      } else {
        offset++;
      }
    }
  }

  return null;
}
