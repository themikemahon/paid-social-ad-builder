'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { WorkspaceNav } from '@/components/WorkspaceNav';
import { PersonaForm } from '@/components/PersonaForm';
import { StrategyDocUpload } from '@/components/StrategyDocUpload';

import type { Project, AudiencePersona, StrategyDocument } from '@/lib/types';

type Tab = 'projects' | 'personas' | 'strategy';

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;

  const tabParam = searchParams.get('tab');
  const activeTab: Tab = tabParam === 'personas' ? 'personas' : tabParam === 'strategy' ? 'strategy' : 'projects';

  const [workspace, setWorkspace] = useState<{ name: string; brandName: string } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [personas, setPersonas] = useState<AudiencePersona[]>([]);
  const [strategyDocs, setStrategyDocs] = useState<StrategyDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const hdrs: Record<string, string> = { 'x-workspace-id': workspaceId, 'Content-Type': 'application/json' };
      if (token) hdrs['Authorization'] = `Bearer ${token}`;

      const [wsRes, projRes, personaRes, docsRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}`, { headers: hdrs }),
        fetch(`/api/projects?workspace_id=${workspaceId}`, { headers: hdrs }),
        fetch(`/api/personas?workspace_id=${workspaceId}`, { headers: hdrs }),
        fetch(`/api/strategy-docs?workspace_id=${workspaceId}`, { headers: hdrs }),
      ]);

      if (wsRes.ok) {
        const ws = await wsRes.json();
        setWorkspace({ name: ws.name, brandName: ws.brandName });
      }
      if (projRes.ok) setProjects(await projRes.json());
      if (personaRes.ok) setPersonas(await personaRes.json());
      if (docsRes.ok) setStrategyDocs(await docsRes.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
    // Store workspace ID for child pages (project, builder)
    localStorage.setItem('current_workspace_id', workspaceId);
  }, [fetchData, workspaceId]);

  if (loading || !workspace) {
    return (
      <div style={{ display: 'flex', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ width: 200, minHeight: '100vh', background: '#f9fafb', borderRight: '1px solid #e5e7eb', padding: '24px 16px' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 16 }}>← All Workspaces</div>
          <div style={{ height: 12, width: 80, background: '#e5e7eb', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 10, width: 120, background: '#f0f0f0', borderRadius: 4 }} />
        </div>
        <div style={{ flex: 1, padding: '32px 40px' }}>
          <div style={{ height: 20, width: 120, background: '#e5e7eb', borderRadius: 4 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <WorkspaceNav workspaceId={workspaceId} workspaceName={workspace.name} brandName={workspace.brandName} />
      <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', height: '100vh' }}>
        {activeTab === 'projects' && (
          <ProjectsTab projects={projects} workspaceId={workspaceId} />
        )}
        {activeTab === 'personas' && (
          <PersonasTab personas={personas} workspaceId={workspaceId} onRefresh={fetchData} />
        )}
        {activeTab === 'strategy' && (
          <StrategyTab docs={strategyDocs} workspaceId={workspaceId} onRefresh={fetchData} />
        )}
      </div>
    </div>
  );
}

function ProjectsTab({ projects, workspaceId }: { projects: Project[]; workspaceId: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Projects</h2>
      </div>
      {projects.length === 0 ? (
        <div style={{ fontSize: 14, color: '#9ca3af', padding: 20 }}>No projects yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {projects.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                background: '#fff',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{p.name}</div>
                {p.brief && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.brief}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 16, flexShrink: 0 }}>
                <a
                  href={`/project/${p.id}`}
                  title="Configure project"
                  style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #242424', background: '#242424', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textDecoration: 'none', transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#444'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#242424'; }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                </a>
                <a
                  href={`/builder/${p.id}?name=${encodeURIComponent(p.name)}`}
                  title="Open ad builder"
                  style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #242424', background: '#242424', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textDecoration: 'none', transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#444'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#242424'; }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonasTab({ personas, workspaceId, onRefresh }: { personas: AudiencePersona[]; workspaceId: string; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingPersona, setEditingPersona] = useState<AudiencePersona | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Audience Personas</h2>
        <button
          onClick={() => { setEditingPersona(null); setShowForm(true); }}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#242424', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          + New Persona
        </button>
      </div>
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <PersonaForm
            workspaceId={workspaceId}
            persona={editingPersona}
            onSaved={() => { setShowForm(false); setEditingPersona(null); onRefresh(); }}
            onCancel={() => { setShowForm(false); setEditingPersona(null); }}
          />
        </div>
      )}
      {personas.length === 0 && !showForm ? (
        <div style={{ fontSize: 14, color: '#9ca3af', padding: 20 }}>No personas yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {personas.map((p) => (
            <div
              key={p.id}
              style={{ padding: '16px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{p.name}</div>
                <button
                  onClick={() => { setEditingPersona(p); setShowForm(true); }}
                  style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Edit
                </button>
              </div>
              {p.painPoints.length > 0 && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                  Pain points: {p.painPoints.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyTab({ docs, workspaceId, onRefresh }: { docs: StrategyDocument[]; workspaceId: string; onRefresh: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Strategy Documents</h2>
      </div>
      <div style={{ marginBottom: 24 }}>
        <StrategyDocUpload workspaceId={workspaceId} onUploaded={onRefresh} />
      </div>
      {docs.length === 0 ? (
        <div style={{ fontSize: 14, color: '#9ca3af', padding: 20 }}>No strategy documents yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map((d) => (
            <div
              key={d.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{d.filename}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {d.fileType.toUpperCase()} · {(d.fileSizeBytes / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
