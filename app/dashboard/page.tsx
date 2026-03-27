'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface WorkspaceMembership {
  workspaceId: string;
  role: string;
  workspaceName: string;
  brandName: string;
}

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem('auth_token');

      // Try JWT auth first
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            setWorkspaces(data.workspaces);
            setLoading(false);
            return;
          }
        } catch { /* fall through */ }
      }

      // Fallback: cookie-based auth (site password) — fetch workspaces directly
      try {
        const res = await fetch('/api/workspaces');
        if (res.ok) {
          const ws = await res.json();
          setUser({ id: 'site', email: '', displayName: 'Team' });
          setWorkspaces(ws.map((w: { id: string; name: string; brandName: string }) => ({
            workspaceId: w.id,
            role: 'admin',
            workspaceName: w.name,
            brandName: w.brandName,
          })));
          setLoading(false);
          return;
        }
      } catch { /* fall through */ }

      // Nothing worked — redirect to login
      router.push('/login?from=/dashboard');
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div style={styles.center}>
        <span style={styles.muted}>Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <span style={styles.errorText}>{error}</span>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Workspaces</h1>
        {user && <span style={styles.userInfo}>{user.displayName}</span>}
      </div>
      {workspaces.length === 0 ? (
        <div style={styles.empty}>No workspaces assigned to your account.</div>
      ) : (
        <div style={styles.grid}>
          {workspaces.map((ws) => (
            <a
              key={ws.workspaceId}
              href={`/workspace/${ws.workspaceId}`}
              style={styles.card}
            >
              <div style={styles.cardBrand}>{ws.brandName}</div>
              <div style={styles.cardName}>{ws.workspaceName}</div>
              <div style={styles.cardRole}>{ws.role}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '40px 24px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  muted: { fontSize: 14, color: '#6b7280' },
  errorText: { fontSize: 14, color: '#dc2626' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  },
  userInfo: {
    fontSize: 13,
    color: '#6b7280',
  },
  empty: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center' as const,
    padding: 40,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 16,
  },
  card: {
    display: 'block',
    padding: '20px 24px',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    background: '#fff',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  cardBrand: {
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 4,
  },
  cardName: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  cardRole: {
    fontSize: 11,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
};
