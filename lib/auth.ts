import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { getDb } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import type { UserRole } from '@/lib/types';

const DEFAULT_EXPIRY = '30d';

/**
 * Hashes a password using SHA-256 and returns a hex-encoded string.
 */
export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

/**
 * Compares a plain-text password against a stored SHA-256 hex hash
 * using a timing-safe comparison to prevent timing attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const candidateHash = hashPassword(password);
  const a = Buffer.from(candidateHash, 'utf-8');
  const b = Buffer.from(storedHash, 'utf-8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Creates a JWT session token for the given user.
 */
export async function createSession(userId: string): Promise<string> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(DEFAULT_EXPIRY)
    .sign(getJwtSecret());
  return token;
}

/**
 * Verifies a JWT token and returns the payload, or null if invalid/expired.
 */
export async function verifySession(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.sub !== 'string') {
      return null;
    }
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

/**
 * Parses the Authorization header, verifies the JWT, checks workspace
 * membership and role, and returns { userId, workspaceId } or throws
 * an apiError response.
 */
export async function requireRole(
  request: NextRequest,
  roles: UserRole[]
): Promise<{ userId: string; workspaceId: string }> {
  // Extract workspace ID (needed for both auth paths)
  const workspaceId = request.headers.get('x-workspace-id')
    || request.nextUrl.pathname.match(/\/workspaces\/([^/]+)/)?.[1]
    || '';

  // Try Bearer token first
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const session = await verifySession(token);
    if (!session) {
      throw apiError(401, 'UNAUTHORIZED', 'Invalid or expired session token');
    }

    if (!workspaceId) {
      throw apiError(400, 'BAD_REQUEST', 'Missing x-workspace-id header');
    }

    const sql = getDb();
    const rows = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId}
        AND user_id = ${session.userId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      throw apiError(403, 'FORBIDDEN', 'Not a member of this workspace');
    }

    const memberRole = rows[0].role as UserRole;
    if (!roles.includes(memberRole)) {
      throw apiError(403, 'FORBIDDEN', 'Insufficient permissions for this action');
    }

    return { userId: session.userId, workspaceId };
  }

  // Fallback: cookie-based site-password auth (full access)
  const cookie = request.cookies.get('site-auth');
  if (cookie?.value === 'authenticated') {
    return { userId: 'site-user', workspaceId: workspaceId || '' };
  }

  throw apiError(401, 'UNAUTHORIZED', 'Missing or invalid authorization header');
}
