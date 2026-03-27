import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

const VALID_FORMATS = [
  'standard-hero', 'photo-forward', 'question-hook', 'stat-callout',
  'text-post', 'comparison', 'notes-app', 'notification', 'imessage', 'meme',
];

function mapCopyBlockRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    copySetId: row.copy_set_id,
    headline: row.headline,
    subhead: row.subhead,
    primaryCta: row.primary_cta,
    secondaryCta: row.secondary_cta,
    creativeFormat: row.creative_format,
    sortOrder: row.sort_order,
    territoryId: row.territory_id ?? null,
    personaId: row.persona_id ?? null,
    approvalStatus: row.approval_status,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/copy-blocks?copy_set_id=<uuid> — list copy blocks in a copy set.
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
      SELECT * FROM copy_blocks
      WHERE copy_set_id = ${copySetId}
      ORDER BY sort_order ASC, created_at ASC
    `;

    return NextResponse.json(rows.map(mapCopyBlockRow));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list copy blocks');
  }
}


/**
 * POST /api/copy-blocks — create an empty copy block in a copy set.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const sql = getDb();
    const body = await request.json();

    const { copy_set_id, creative_format, sort_order } = body;

    if (!copy_set_id) {
      return apiError(400, 'VALIDATION_ERROR', 'copy_set_id is required');
    }

    if (creative_format && !VALID_FORMATS.includes(creative_format)) {
      return apiError(400, 'VALIDATION_ERROR', `Invalid creative_format. Must be one of: ${VALID_FORMATS.join(', ')}`);
    }

    const rows = await sql`
      INSERT INTO copy_blocks (copy_set_id, headline, subhead, primary_cta, secondary_cta, creative_format, sort_order)
      VALUES (
        ${copy_set_id},
        '',
        '',
        '',
        '',
        ${creative_format || 'standard-hero'},
        ${sort_order ?? 0}
      )
      RETURNING *
    `;

    return NextResponse.json(mapCopyBlockRow(rows[0]), { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create copy block');
  }
}
