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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/copy-blocks/[id] — get a single copy block.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      SELECT * FROM copy_blocks WHERE id = ${id} LIMIT 1
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy block not found');
    }

    return NextResponse.json(mapCopyBlockRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to get copy block');
  }
}


/**
 * PUT /api/copy-blocks/[id] — partial update of a copy block.
 * Supports inline editing: any subset of fields can be updated.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();
    const body = await request.json();

    const { headline, subhead, primary_cta, secondary_cta, creative_format, sort_order, territory_id, persona_id } = body;

    if (creative_format !== undefined && !VALID_FORMATS.includes(creative_format)) {
      return apiError(400, 'VALIDATION_ERROR', `Invalid creative_format. Must be one of: ${VALID_FORMATS.join(', ')}`);
    }

    const rows = await sql`
      UPDATE copy_blocks SET
        headline = COALESCE(${headline ?? null}, headline),
        subhead = COALESCE(${subhead ?? null}, subhead),
        primary_cta = COALESCE(${primary_cta ?? null}, primary_cta),
        secondary_cta = COALESCE(${secondary_cta ?? null}, secondary_cta),
        creative_format = COALESCE(${creative_format ?? null}, creative_format),
        sort_order = COALESCE(${sort_order ?? null}, sort_order),
        territory_id = COALESCE(${territory_id ?? null}, territory_id),
        persona_id = COALESCE(${persona_id ?? null}, persona_id),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy block not found');
    }

    return NextResponse.json(mapCopyBlockRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update copy block');
  }
}

/**
 * DELETE /api/copy-blocks/[id] — delete a copy block.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      DELETE FROM copy_blocks WHERE id = ${id} RETURNING id
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy block not found');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete copy block');
  }
}
