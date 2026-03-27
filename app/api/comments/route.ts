import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

async function ensureLegacyTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS ad_comments (
      id SERIAL PRIMARY KEY,
      ad_id TEXT NOT NULL,
      author TEXT NOT NULL,
      message TEXT NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

/**
 * GET /api/comments?copy_block_id=<uuid>
 * Returns comments for a copy block in chronological order.
 *
 * Legacy mode (no copy_block_id): returns all ad_comments grouped by ad_id.
 */
export async function GET(request: NextRequest) {
  try {
    const copyBlockId = request.nextUrl.searchParams.get('copy_block_id');

    // Legacy mode
    if (!copyBlockId) {
      const sql = getDb();
      await ensureLegacyTable();
      const rows = await sql`SELECT id, ad_id, author, message, resolved, created_at FROM ad_comments ORDER BY created_at ASC`;
      const result: Record<string, Array<{ id: number; author: string; message: string; resolved: boolean; created_at: string }>> = {};
      for (const row of rows) {
        if (!result[row.ad_id as string]) result[row.ad_id as string] = [];
        result[row.ad_id as string].push({
          id: row.id as number,
          author: row.author as string,
          message: row.message as string,
          resolved: row.resolved as boolean,
          created_at: row.created_at as string,
        });
      }
      return NextResponse.json(result);
    }

    // New mode: workspace-aware comments on copy_block_comments
    await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const sql = getDb();

    const rows = await sql`
      SELECT c.id, c.copy_block_id, c.author_id, c.message, c.resolved,
             c.created_at, c.updated_at, u.display_name AS author_name
      FROM copy_block_comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.copy_block_id = ${copyBlockId}
      ORDER BY c.created_at ASC
    `;

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        copyBlockId: row.copy_block_id,
        authorId: row.author_id,
        authorName: row.author_name,
        message: row.message,
        resolved: row.resolved,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('GET /api/comments error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch comments');
  }
}

/**
 * POST /api/comments
 * Create a comment on a copy block.
 *
 * Body: { copy_block_id: string, message: string }
 * Legacy body: { ad_id: string, author: string, message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Legacy mode
    if (body.ad_id !== undefined) {
      if (!body.ad_id || !body.author || !body.message) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
      }
      const sql = getDb();
      await ensureLegacyTable();
      const rows = await sql`
        INSERT INTO ad_comments (ad_id, author, message)
        VALUES (${body.ad_id}, ${body.author}, ${body.message})
        RETURNING id, created_at
      `;
      return NextResponse.json({ id: rows[0].id, created_at: rows[0].created_at });
    }

    // New mode
    const { userId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { copy_block_id, message } = body;

    if (!copy_block_id) {
      return apiError(400, 'VALIDATION_ERROR', 'copy_block_id is required');
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return apiError(400, 'VALIDATION_ERROR', 'message is required');
    }

    const sql = getDb();

    // Verify copy block exists
    const existing = await sql`SELECT id FROM copy_blocks WHERE id = ${copy_block_id}`;
    if (existing.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Copy block not found');
    }

    const rows = await sql`
      INSERT INTO copy_block_comments (copy_block_id, author_id, message)
      VALUES (${copy_block_id}, ${userId}, ${message.trim()})
      RETURNING id, copy_block_id, author_id, message, resolved, created_at, updated_at
    `;

    const row = rows[0];
    // Fetch author name
    const userRows = await sql`SELECT display_name FROM users WHERE id = ${userId}`;
    const authorName = userRows.length > 0 ? userRows[0].display_name : null;

    return NextResponse.json(
      {
        id: row.id,
        copyBlockId: row.copy_block_id,
        authorId: row.author_id,
        authorName,
        message: row.message,
        resolved: row.resolved,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('POST /api/comments error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create comment');
  }
}

/**
 * PATCH /api/comments
 * Resolve/unresolve a comment, or edit message (author-only for edits).
 *
 * Body: { id: string, resolved?: boolean, message?: string }
 * Legacy body: { id: number, resolved?: boolean, message?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Legacy mode: numeric id
    if (typeof body.id === 'number') {
      const sql = getDb();
      await ensureLegacyTable();
      if (body.message !== undefined) {
        await sql`UPDATE ad_comments SET message = ${body.message} WHERE id = ${body.id}`;
      }
      if (body.resolved !== undefined) {
        await sql`UPDATE ad_comments SET resolved = ${body.resolved} WHERE id = ${body.id}`;
      }
      return NextResponse.json({ ok: true });
    }

    // New mode
    const { userId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id, resolved, message } = body;

    if (!id) {
      return apiError(400, 'VALIDATION_ERROR', 'id is required');
    }

    const sql = getDb();

    // Fetch existing comment
    const existing = await sql`
      SELECT id, author_id FROM copy_block_comments WHERE id = ${id}
    `;
    if (existing.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Comment not found');
    }

    // Message edits are author-only
    if (message !== undefined && existing[0].author_id !== userId) {
      return apiError(403, 'FORBIDDEN', 'Only the comment author can edit the message');
    }

    // Apply updates
    if (message !== undefined) {
      if (typeof message !== 'string' || message.trim().length === 0) {
        return apiError(400, 'VALIDATION_ERROR', 'message cannot be empty');
      }
      await sql`
        UPDATE copy_block_comments
        SET message = ${message.trim()}, updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    if (resolved !== undefined) {
      await sql`
        UPDATE copy_block_comments
        SET resolved = ${resolved}, updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    // Return updated comment
    const rows = await sql`
      SELECT c.id, c.copy_block_id, c.author_id, c.message, c.resolved,
             c.created_at, c.updated_at, u.display_name AS author_name
      FROM copy_block_comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.id = ${id}
    `;
    const row = rows[0];

    return NextResponse.json({
      id: row.id,
      copyBlockId: row.copy_block_id,
      authorId: row.author_id,
      authorName: row.author_name,
      message: row.message,
      resolved: row.resolved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('PATCH /api/comments error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update comment');
  }
}

/**
 * DELETE /api/comments
 * Delete a comment. Restricted to comment author.
 *
 * Body: { id: string }
 * Legacy body: { id: number }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();

    // Legacy mode: numeric id
    if (typeof body.id === 'number') {
      const sql = getDb();
      await ensureLegacyTable();
      await sql`DELETE FROM ad_comments WHERE id = ${body.id}`;
      return NextResponse.json({ ok: true });
    }

    // New mode
    const { userId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = body;

    if (!id) {
      return apiError(400, 'VALIDATION_ERROR', 'id is required');
    }

    const sql = getDb();

    // Verify comment exists and check ownership
    const existing = await sql`
      SELECT id, author_id FROM copy_block_comments WHERE id = ${id}
    `;
    if (existing.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Comment not found');
    }
    if (existing[0].author_id !== userId) {
      return apiError(403, 'FORBIDDEN', 'Only the comment author can delete this comment');
    }

    await sql`DELETE FROM copy_block_comments WHERE id = ${id}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('DELETE /api/comments error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete comment');
  }
}
