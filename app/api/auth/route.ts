import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password } = body;

  // ── User login flow (email + password) ──
  if (email && password) {
    const sql = getDb();
    const rows = await sql`
      SELECT id, email, display_name, password_hash
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    if (rows.length === 0 || !verifyPassword(password, rows[0].password_hash)) {
      // Requirement 2.2: identical error regardless of which credential was wrong
      return apiError(401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    const user = rows[0];
    const token = await createSession(user.id);

    return NextResponse.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
    });
  }

  // ── Existing site-password flow (password only, no email) ──
  const sitePassword = process.env.SITE_PASSWORD;

  if (!sitePassword || password !== sitePassword) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("site-auth", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
