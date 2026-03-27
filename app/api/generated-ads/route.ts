import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    copyBlockId: row.copy_block_id,
    territoryId: row.territory_id,
    personaId: row.persona_id,
    platform: row.platform,
    creativeFormat: row.creative_format,
    postCopy: row.post_copy,
    imageHeadline: row.image_headline,
    imageSubhead: row.image_subhead,
    stripHeadline: row.strip_headline,
    stripCta: row.strip_cta,
    sourcePrimary: row.source_primary,
    sourceSecondary: row.source_secondary,
    sourceCtaNative: row.source_cta_native,
    sourceCtaCustom: row.source_cta_custom,
    copyNotes: row.copy_notes,
    imageUrl: row.image_url,
    approvalStatus: row.approval_status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/** GET /api/generated-ads?project_id=X&territory_id=Y&platform=Z */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const projectId = request.nextUrl.searchParams.get('project_id');
    const territoryId = request.nextUrl.searchParams.get('territory_id');
    const platform = request.nextUrl.searchParams.get('platform');

    if (!projectId) return apiError(400, 'VALIDATION_ERROR', 'project_id required');

    const sql = getDb();

    // Build query with optional filters
    let rows;
    if (territoryId && platform) {
      rows = await sql`
        SELECT ga.*, ap.name as persona_name FROM generated_ads ga
        LEFT JOIN audience_personas ap ON ap.id = ga.persona_id
        WHERE ga.territory_id = ${territoryId} AND ga.platform = ${platform}
          AND ga.copy_block_id IN (
            SELECT cb.id FROM copy_blocks cb
            JOIN copy_sets cs ON cs.id = cb.copy_set_id
            WHERE cs.project_id = ${projectId}
          )
        ORDER BY ga.sort_order ASC, ga.created_at ASC
      `;
    } else if (territoryId) {
      rows = await sql`
        SELECT ga.*, ap.name as persona_name FROM generated_ads ga
        LEFT JOIN audience_personas ap ON ap.id = ga.persona_id
        WHERE ga.territory_id = ${territoryId}
          AND ga.copy_block_id IN (
            SELECT cb.id FROM copy_blocks cb
            JOIN copy_sets cs ON cs.id = cb.copy_set_id
            WHERE cs.project_id = ${projectId}
          )
        ORDER BY ga.platform ASC, ga.sort_order ASC, ga.created_at ASC
      `;
    } else {
      rows = await sql`
        SELECT ga.*, ap.name as persona_name FROM generated_ads ga
        LEFT JOIN audience_personas ap ON ap.id = ga.persona_id
        WHERE ga.copy_block_id IN (
          SELECT cb.id FROM copy_blocks cb
          JOIN copy_sets cs ON cs.id = cb.copy_set_id
          WHERE cs.project_id = ${projectId}
        )
        ORDER BY ga.territory_id ASC, ga.platform ASC, ga.sort_order ASC
      `;
    }

    return NextResponse.json(rows.map(r => ({ ...mapRow(r), personaName: r.persona_name })));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list generated ads');
  }
}
