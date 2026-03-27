import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { exportCsv } from '@/lib/csv-parser';
import type { CopyBlockFields } from '@/lib/types';

/**
 * GET /api/csv-export?copy_set_id=<uuid> — export copy blocks as CSV.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);

    const copySetId = request.nextUrl.searchParams.get('copy_set_id');
    if (!copySetId) {
      return apiError(400, 'VALIDATION_ERROR', 'copy_set_id query parameter is required');
    }

    const sql = getDb();
    const rows = await sql`
      SELECT headline, subhead, primary_cta, secondary_cta
      FROM copy_blocks
      WHERE copy_set_id = ${copySetId}
      ORDER BY sort_order ASC, created_at ASC
    `;

    const blocks: CopyBlockFields[] = rows.map((row) => ({
      headline: row.headline as string,
      subhead: row.subhead as string,
      primaryCta: row.primary_cta as string,
      secondaryCta: row.secondary_cta as string,
    }));

    const csv = exportCsv(blocks);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="copy-blocks.csv"',
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to export CSV');
  }
}
