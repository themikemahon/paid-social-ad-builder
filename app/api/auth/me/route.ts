import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  // Extract Bearer token from Authorization header
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return apiError(401, "UNAUTHORIZED", "Missing or invalid authorization header");
  }
  const token = authHeader.slice(7);

  // Verify JWT session
  const session = await verifySession(token);
  if (!session) {
    return apiError(401, "UNAUTHORIZED", "Invalid or expired session token");
  }

  const sql = getDb();

  // Fetch user profile
  const userRows = await sql`
    SELECT id, email, display_name, created_at
    FROM users
    WHERE id = ${session.userId}
  `;

  if (userRows.length === 0) {
    return apiError(404, "NOT_FOUND", "User not found");
  }

  const user = userRows[0];

  // Fetch workspace memberships
  const memberships = await sql`
    SELECT wm.workspace_id, wm.role, w.name AS workspace_name, w.brand_name
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ${session.userId}
  `;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
    },
    workspaces: memberships.map((m) => ({
      workspaceId: m.workspace_id,
      role: m.role,
      workspaceName: m.workspace_name,
      brandName: m.brand_name,
    })),
  });
}
