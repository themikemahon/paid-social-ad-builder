/**
 * Property tests for authentication error opacity and unauthenticated access.
 *
 * Property 7: Authentication error opacity — invalid credentials return identical error structure
 * Property 8: Unauthenticated access redirect — requests without valid session get 401
 *
 * Validates: Requirements 2.2, 2.3
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { hashPassword, verifySession, requireRole } from '@/lib/auth';
import { NextRequest } from 'next/server';

// Set JWT_SECRET before any auth module usage
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-property-tests-minimum-length';
});

// ── Mocks ──

// Mock getDb to return a controllable SQL tagged template function
const mockSql = vi.fn();
vi.mock('@/lib/db', () => ({
  getDb: () => mockSql,
}));

// Helper: create a fake user row as the DB would return
function fakeUserRow(email: string, password: string) {
  return {
    id: 'user-uuid-123',
    email,
    display_name: 'Test User',
    password_hash: hashPassword(password),
  };
}

// Helper: build a NextRequest for the POST /api/auth endpoint
function buildLoginRequest(email: string, password: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

// Helper: build a NextRequest with optional Authorization header
function buildAuthedRequest(token?: string, workspaceId?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  if (workspaceId) headers['x-workspace-id'] = workspaceId;
  return new NextRequest('http://localhost:3000/api/auth/me', {
    method: 'GET',
    headers,
  });
}

// ── Property 7: Authentication error opacity ──
// Validates: Requirements 2.2
describe('Property 7: Authentication error opacity', () => {
  it('invalid credentials return identical error structure regardless of which credential is wrong', async () => {
    // Dynamically import the route handler so mocks are in place
    const { POST } = await import('@/app/api/auth/route');

    const KNOWN_EMAIL = 'known@example.com';
    const KNOWN_PASSWORD = 'correct-password-123';

    await fc.assert(
      fc.asyncProperty(
        // Generate scenario: 'wrong_email' | 'wrong_password' | 'both_wrong'
        fc.constantFrom('wrong_email', 'wrong_password', 'both_wrong'),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (scenario, randomEmail, randomPassword) => {
          // Ensure generated values differ from known credentials
          const wrongEmail = randomEmail === KNOWN_EMAIL ? randomEmail + 'x' : randomEmail;
          const wrongPassword = randomPassword === KNOWN_PASSWORD ? randomPassword + 'x' : randomPassword;

          let email: string;
          let password: string;

          switch (scenario) {
            case 'wrong_email':
              email = wrongEmail;
              password = KNOWN_PASSWORD;
              // DB returns no rows for unknown email
              mockSql.mockResolvedValueOnce([]);
              break;
            case 'wrong_password':
              email = KNOWN_EMAIL;
              password = wrongPassword;
              // DB returns the user but password won't match
              mockSql.mockResolvedValueOnce([fakeUserRow(KNOWN_EMAIL, KNOWN_PASSWORD)]);
              break;
            case 'both_wrong':
              email = wrongEmail;
              password = wrongPassword;
              // DB returns no rows
              mockSql.mockResolvedValueOnce([]);
              break;
          }

          const req = buildLoginRequest(email!, password!);
          const res = await POST(req);
          const body = await res.json();

          // All invalid credential responses must be identical in structure
          expect(res.status).toBe(401);
          expect(body.code).toBe('UNAUTHORIZED');
          expect(body.error).toBe('Invalid credentials');
          // Must have exactly these keys — no extra fields leaking info
          expect(Object.keys(body).sort()).toEqual(['code', 'error']);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── Property 8: Unauthenticated access redirect ──
// Validates: Requirements 2.3
describe('Property 8: Unauthenticated access redirect', () => {
  it('verifySession returns null for any arbitrary non-JWT string', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (arbitraryToken) => {
          const result = await verifySession(arbitraryToken);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('requireRole throws 401 for requests without Authorization header', async () => {
    const req = new NextRequest('http://localhost:3000/api/workspaces', {
      method: 'GET',
    });

    try {
      await requireRole(req, ['admin']);
      // Should not reach here
      expect.fail('requireRole should have thrown');
    } catch (error: unknown) {
      // requireRole throws a NextResponse (from apiError)
      const res = error as Response;
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    }
  });

  it('requireRole throws 401 for requests with invalid Bearer tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (garbageToken) => {
          const req = buildAuthedRequest(garbageToken, 'workspace-123');

          try {
            await requireRole(req, ['admin']);
            expect.fail('requireRole should have thrown');
          } catch (error: unknown) {
            const res = error as Response;
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.code).toBe('UNAUTHORIZED');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('GET /api/auth/me returns 401 for requests without valid auth', async () => {
    const { GET } = await import('@/app/api/auth/me/route');

    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
        async (maybeToken) => {
          const req = buildAuthedRequest(maybeToken);
          const res = await GET(req);

          expect(res.status).toBe(401);
          const body = await res.json();
          expect(body.code).toBe('UNAUTHORIZED');
        }
      ),
      { numRuns: 50 }
    );
  });
});
