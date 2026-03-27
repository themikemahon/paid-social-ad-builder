import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { parseCsv } from '@/lib/csv-parser';

/**
 * POST /api/csv-import — upload a CSV file, parse into copy blocks in a copy set.
 * Expects multipart form data with fields: file (CSV), copy_set_id (UUID).
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor']);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const copySetId = formData.get('copy_set_id') as string | null;

    if (!file) {
      return apiError(400, 'VALIDATION_ERROR', 'file is required');
    }
    if (!copySetId) {
      return apiError(400, 'VALIDATION_ERROR', 'copy_set_id is required');
    }

    const content = await file.text();
    const result = parseCsv(content);

    if (result.blocks.length === 0) {
      return NextResponse.json({
        successCount: 0,
        errorCount: result.errorCount,
        errors: result.errors,
      });
    }

    // Insert parsed blocks into the copy set
    const sql = getDb();

    // Get current max sort_order for the copy set
    const maxRows = await sql`
      SELECT COALESCE(MAX(sort_order), -1) AS max_order
      FROM copy_blocks WHERE copy_set_id = ${copySetId}
    `;
    let sortOrder = (maxRows[0].max_order as number) + 1;

    for (const block of result.blocks) {
      await sql`
        INSERT INTO copy_blocks (copy_set_id, headline, subhead, primary_cta, secondary_cta, sort_order)
        VALUES (
          ${copySetId},
          ${block.headline},
          ${block.subhead},
          ${block.primaryCta},
          ${block.secondaryCta},
          ${sortOrder}
        )
      `;
      sortOrder++;
    }

    return NextResponse.json({
      successCount: result.successCount,
      errorCount: result.errorCount,
      errors: result.errors,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to import CSV');
  }
}
