import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? null,
    filename: row.filename,
    fileType: row.file_type,
    blobUrl: row.blob_url,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/strategy-docs/[id] — get a single strategy document.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      SELECT * FROM strategy_documents
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Strategy document not found');
    }

    return NextResponse.json(mapRow(rows[0]));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to get strategy document');
  }
}

/**
 * DELETE /api/strategy-docs/[id] — delete a strategy document and its blob.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor']);
    const { id } = await context.params;
    const sql = getDb();

    const rows = await sql`
      DELETE FROM strategy_documents
      WHERE id = ${id} AND workspace_id = ${workspaceId}
      RETURNING blob_url
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Strategy document not found');
    }

    // Clean up blob storage
    try {
      await del(rows[0].blob_url as string);
    } catch {
      // Log but don't fail the request if blob deletion fails
      console.error('Failed to delete blob:', rows[0].blob_url);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete strategy document');
  }
}
