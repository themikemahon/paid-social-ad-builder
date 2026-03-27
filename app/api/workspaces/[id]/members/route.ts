import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import type { UserRole } from '@/lib/types';

const VALID_ROLES: UserRole[] = ['admin', 'editor', 'reviewer', 'viewer'];

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/workspaces/[id]/members — list workspace members.
 * Any workspace member can view the member list.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireRole(request, ['admin', 'editor', 'reviewer', 'viewer']);
    const { id } = await context.params;

    if (id !== workspaceId) {
      return apiError(403, 'FORBIDDEN', 'Workspace ID mismatch');
    }

    const sql = getDb();
    const rows = await sql`
      SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.created_at,
             u.email, u.display_name
      FROM workspace_members wm
      INNER JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ${id}
      ORDER BY wm.created_at ASC
    `;

    const members = rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      userId: r.user_id,
      role: r.role,
      createdAt: r.created_at,
      user: { id: r.user_id, email: r.email, displayName: r.display_name },
    }));

    return NextResponse.json(members);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list members');
  }
}

/**
 * POST /api/workspaces/[id]/members — add a member (admin-only).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(request, ['admin']);
    const { id } = await context.params;
    const body = await request.json();
    const { user_id, role } = body;

    if (!user_id) {
      return apiError(400, 'VALIDATION_ERROR', 'user_id is required');
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return apiError(400, 'VALIDATION_ERROR', `role must be one of: ${VALID_ROLES.join(', ')}`);
    }

    const sql = getDb();

    // Verify user exists
    const userCheck = await sql`SELECT id FROM users WHERE id = ${user_id} LIMIT 1`;
    if (userCheck.length === 0) {
      return apiError(404, 'NOT_FOUND', 'User not found');
    }

    // Check for existing membership
    const existing = await sql`
      SELECT id FROM workspace_members
      WHERE workspace_id = ${id} AND user_id = ${user_id}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return apiError(409, 'CONFLICT', 'User is already a member of this workspace');
    }

    const rows = await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${id}, ${user_id}, ${role})
      RETURNING *
    `;

    return NextResponse.json({
      id: rows[0].id,
      workspaceId: rows[0].workspace_id,
      userId: rows[0].user_id,
      role: rows[0].role,
      createdAt: rows[0].created_at,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to add member');
  }
}

/**
 * DELETE /api/workspaces/[id]/members — remove a member (admin-only).
 * Expects ?user_id=<uuid> query parameter.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { userId: currentUserId } = await requireRole(request, ['admin']);
    const { id } = await context.params;
    const targetUserId = request.nextUrl.searchParams.get('user_id');

    if (!targetUserId) {
      return apiError(400, 'VALIDATION_ERROR', 'user_id query parameter is required');
    }

    // Prevent admin from removing themselves if they're the last admin
    if (targetUserId === currentUserId) {
      const sql = getDb();
      const adminCount = await sql`
        SELECT COUNT(*) as count FROM workspace_members
        WHERE workspace_id = ${id} AND role = 'admin'
      `;
      if (Number(adminCount[0].count) <= 1) {
        return apiError(400, 'VALIDATION_ERROR', 'Cannot remove the last admin from a workspace');
      }
    }

    const sql = getDb();
    const rows = await sql`
      DELETE FROM workspace_members
      WHERE workspace_id = ${id} AND user_id = ${targetUserId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return apiError(404, 'NOT_FOUND', 'Member not found in this workspace');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return apiError(500, 'INTERNAL_ERROR', 'Failed to remove member');
  }
}
