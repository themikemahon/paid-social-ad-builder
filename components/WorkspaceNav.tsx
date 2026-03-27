'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface WorkspaceNavProps {
  workspaceId: string;
  workspaceName: string;
  brandName: string;
}

export function WorkspaceNav({ workspaceId, workspaceName, brandName }: WorkspaceNavProps) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { label: 'Projects', href: `/workspace/${workspaceId}`, icon: '📁' },
    { label: 'Personas', href: `/workspace/${workspaceId}?tab=personas`, icon: '👤' },
    { label: 'Strategy Docs', href: `/workspace/${workspaceId}?tab=strategy`, icon: '📄' },
  ];

  const isWorkspacePath = pathname === `/workspace/${workspaceId}`;

  return (
    <div style={styles.sidebar}>
      <a href="/dashboard" style={styles.backLink}>← All Workspaces</a>
      <div style={styles.brandSection}>
        <div style={styles.brandName}>{brandName}</div>
        <div style={styles.workspaceName}>{workspaceName}</div>
      </div>
      <nav style={styles.nav}>
        {navItems.map((item) => {
          const isActive = isWorkspacePath && item.href === pathname + (typeof window !== 'undefined' ? window.location.search : '');
          return (
            <a
              key={item.label}
              href={item.href}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    minWidth: 240,
    borderRight: '1px solid #e5e7eb',
    background: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    padding: '16px 0',
  },
  backLink: {
    fontSize: 13,
    color: '#6b7280',
    textDecoration: 'none',
    padding: '8px 16px',
    display: 'block',
  },
  brandSection: {
    padding: '16px 16px 12px',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: 8,
  },
  brandName: {
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
  },
  workspaceName: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '0 8px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    color: '#374151',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  navItemActive: {
    background: '#e5e7eb',
    fontWeight: 600,
  },
};
