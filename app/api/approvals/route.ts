import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals?copy_set_id=<uuid>
 * Returns approval status for all copy blocks in a copy set.
 *
 * Also supports legacy mode (no query params) for backward compatibility
 * with the old ad_approvals table.
 */
export async function GET(request: NextRequest) {
  try {
    const copySetId = request.nextUrl.searchParams.get('copy_set_id');

    // Legacy mode: no copy_set_id param — return old ad_approvals data
    if (!copySetId) {
      const sql = getDb();
      await sql`
        CREATE TABLE IF NOT EXISTS ad_approvals (
          ad_id TEXT PRIMARY KEY,
          approved BOOLEAN NOT NULL DEFAULT false,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      const rows = await sql`SELECT ad_id FROM ad_approvals WHERE approved = true`;
      const result: Record<string, boolean> = {};
      for (const row of rows) result[row.ad_id as string] = true;
      return NextResponse.json(result);
    }

    // New mode: workspace-aware approval status
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const sql = getDb();
    const rows = await sql`
      SELECT id, approval_status, approved_by, approved_at
      FROM copy_blocks
      WHERE copy_set_id = ${copySetId}
      ORDER BY sort_order ASC, created_at ASC
    `;

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        approvalStatus: row.approval_status,
        approvedBy: row.approved_by ?? null,
        approvedAt: row.approved_at ?? null,
      }))
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('GET /api/approvals error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch approvals');
  }
}


/**
 * POST /api/approvals
 * Approve or revoke approval on a copy block.
 *
 * Body: { copy_block_id: string, action: 'approve' | 'revoke' }
 *
 * Also supports legacy mode: { ad_id: string, approved: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Legacy mode: if body has ad_id, use old ad_approvals table
    if (body.ad_id !== undefined) {
      const { ad_id, approved } = body;
      const sql = getDb();
      await sql`
        CREATE TABLE IF NOT EXISTS ad_approvals (
          ad_id TEXT PRIMARY KEY,
          approved BOOLEAN NOT NULL DEFAULT false,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      await sql`
        INSERT INTO ad_approvals (ad_id, approved)
        VALUES (${ad_id}, ${approved})
        ON CONFLICT (ad_id)
        DO UPDATE SET approved = ${approved}, updated_at = NOW()
      `;
      return NextResponse.json({ ok: true });
    }

    // New mode: workspace-aware approval on copy_blocks table
    const { userId } = await requireRole(request, ['admin', 'reviewer']);

    const { copy_block_id, action } = body;

    if (!copy_block_id) {
      return apiError(400, 'VALIDATION_ERROR', 'copy_block_id is required');
    }

    if (action !== 'approve' && action !== 'revoke') {
      return apiError(400, 'VALIDATION_ERROR', "action must be 'approve' or 'revoke'");
    }

    const sql = getDb();

    // Verify the copy block exists
    const existing = await sql`
      SELECT id, approval_status FROM copy_blocks WHERE id = ${copy_block_id}
    `;
    if (existing.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy block not found');
    }

    if (action === 'approve') {
      const rows = await sql`
        UPDATE copy_blocks
        SET approval_status = 'approved',
            approved_by = ${userId},
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = ${copy_block_id}
        RETURNING id, approval_status, approved_by, approved_at
      `;
      return NextResponse.json({
        id: rows[0].id,
        approvalStatus: rows[0].approval_status,
        approvedBy: rows[0].approved_by,
        approvedAt: rows[0].approved_at,
      });
    }

    // action === 'revoke'
    const rows = await sql`
      UPDATE copy_blocks
      SET approval_status = 'pending',
          approved_by = NULL,
          approved_at = NULL,
          updated_at = NOW()
      WHERE id = ${copy_block_id}
      RETURNING id, approval_status, approved_by, approved_at
    `;
    return NextResponse.json({
      id: rows[0].id,
      approvalStatus: rows[0].approval_status,
      approvedBy: rows[0].approved_by ?? null,
      approvedAt: rows[0].approved_at ?? null,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('POST /api/approvals error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update approval');
  }
}
