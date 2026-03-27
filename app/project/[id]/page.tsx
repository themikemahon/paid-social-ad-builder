'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Project, AudiencePersona, SocialPlatform } from '@/lib/types';

interface Territory {
  id: string;
  name: string;
  description: string;
  audienceIds: string[];
}

function getApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const hdrs: Record<string, string> = { ...extra };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    const wsId = localStorage.getItem('current_workspace_id');
    if (token) hdrs['Authorization'] = `Bearer ${token}`;
    if (wsId) hdrs['x-workspace-id'] = wsId;
  }
  return hdrs;
}

const ALL_PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'meta', label: 'Meta (Facebook / Instagram)' },
  { id: 'reddit', label: 'Reddit' },
];

export default function ProjectConfigPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [personas, setPersonas] = useState<AudiencePersona[]>([]);
  const [enabledPlatforms, setEnabledPlatforms] = useState<SocialPlatform[]>(['linkedin', 'meta', 'reddit']);
  const [brief, setBrief] = useState('');
  const [objectives, setObjectives] = useState('');
  const [loading, setLoading] = useState(true);
  const [newTerritoryName, setNewTerritoryName] = useState('');
  const [newTerritoryDesc, setNewTerritoryDesc] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const hdrs = getApiHeaders();

      const projRes = await fetch(`/api/projects/${projectId}`, { headers: hdrs });
      if (!projRes.ok) return;
      const proj: Project & { enabledPlatforms?: SocialPlatform[] } = await projRes.json();
      setProject(proj);
      setBrief(proj.brief || '');
      setObjectives(proj.objectives || '');

      // Parse enabled platforms from project or default to all
      const ep = (proj as any).enabledPlatforms;
      if (Array.isArray(ep)) setEnabledPlatforms(ep);

      const [terrRes, personaRes] = await Promise.all([
        fetch(`/api/territories?project_id=${projectId}`, { headers: hdrs }),
        fetch(`/api/personas?workspace_id=${proj.workspaceId}`, { headers: hdrs }),
      ]);

      if (terrRes.ok) setTerritories(await terrRes.json());
      if (personaRes.ok) setPersonas(await personaRes.json());
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveProject = async (updates: Record<string, unknown>) => {
    const hdrs = getApiHeaders({ 'Content-Type': 'application/json' });
    await fetch(`/api/projects/${projectId}`, {
      method: 'PUT', headers: hdrs,
      body: JSON.stringify(updates),
    });
  };

  const togglePlatform = async (platform: SocialPlatform) => {
    const next = enabledPlatforms.includes(platform)
      ? enabledPlatforms.filter(p => p !== platform)
      : [...enabledPlatforms, platform];
    setEnabledPlatforms(next);
    await saveProject({ enabled_platforms: JSON.stringify(next) });
  };

  const addTerritory = async () => {
    if (!newTerritoryName.trim()) return;
    const hdrs = getApiHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/territories', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ project_id: projectId, name: newTerritoryName, description: newTerritoryDesc }),
    });
    if (res.ok) {
      setNewTerritoryName('');
      setNewTerritoryDesc('');
      fetchData();
    }
  };

  const deleteTerritory = async (id: string) => {
    const hdrs = getApiHeaders();
    await fetch(`/api/territories/${id}`, { method: 'DELETE', headers: hdrs });
    fetchData();
  };

  if (loading || !project) {
    return <div style={S.center}>Loading project…</div>;
  }

  return (
    <div style={S.page}>
      <div style={S.topBar}>
        <a href={`/workspace/${project.workspaceId}`} style={S.backLink}>← Back to workspace</a>
        <a href={`/builder/${projectId}`} style={S.builderBtn}>Open Ad Builder →</a>
      </div>

      <h1 style={S.title}>{project.name}</h1>
      <p style={S.subtitle}>Project Configuration</p>

      {/* Brief & Objectives */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>Project Brief</h2>
        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          onBlur={() => saveProject({ brief })}
          placeholder="Describe the campaign goals, target market, and key messages…"
          rows={4}
          style={S.textarea}
        />
        <h2 style={{ ...S.sectionTitle, marginTop: 16 }}>Objectives</h2>
        <textarea
          value={objectives}
          onChange={e => setObjectives(e.target.value)}
          onBlur={() => saveProject({ objectives })}
          placeholder="What are the measurable goals for this campaign?"
          rows={3}
          style={S.textarea}
        />
      </section>

      {/* Platforms */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>Platforms</h2>
        <p style={S.hint}>Select which platforms to build ads for</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          {ALL_PLATFORMS.map(p => (
            <button
              key={p.id}
              onClick={() => togglePlatform(p.id)}
              style={{
                ...S.platformBtn,
                ...(enabledPlatforms.includes(p.id) ? S.platformBtnActive : {}),
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Creative Territories */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>Creative Territories</h2>
        <p style={S.hint}>Organize your ads into messaging themes</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {territories.map(t => (
            <div key={t.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={S.cardTitle}>{t.name}</div>
                  {t.description && <div style={S.cardDesc}>{t.description}</div>}
                  {t.audienceIds.length > 0 && (
                    <div style={S.cardMeta}>
                      Audiences: {t.audienceIds.map(id => personas.find(p => p.id === id)?.name || id).join(', ')}
                    </div>
                  )}
                  {t.audienceIds.length === 0 && (
                    <div style={S.cardMeta}>All audiences</div>
                  )}
                </div>
                <button onClick={() => deleteTerritory(t.id)} style={S.deleteBtn}>✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* Add territory form */}
        <div style={{ ...S.card, marginTop: 12, background: '#f9fafb' }}>
          <input
            value={newTerritoryName}
            onChange={e => setNewTerritoryName(e.target.value)}
            placeholder="Territory name (e.g., General Product)"
            style={S.input}
          />
          <input
            value={newTerritoryDesc}
            onChange={e => setNewTerritoryDesc(e.target.value)}
            placeholder="Description (optional)"
            style={{ ...S.input, marginTop: 8 }}
          />
          <button onClick={addTerritory} style={S.addBtn}>+ Add Territory</button>
        </div>
      </section>

      {/* Audiences */}
      <section style={S.section}>
        <h2 style={S.sectionTitle}>Assigned Audiences</h2>
        <p style={S.hint}>Personas assigned to this project</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {personas.map(p => (
            <div key={p.id} style={S.audienceRow}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{p.name}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {p.painPoints.slice(0, 2).join(', ')}{p.painPoints.length > 2 ? '…' : ''}
              </span>
            </div>
          ))}
          {personas.length === 0 && <div style={S.hint}>No personas defined. Add them in the workspace settings.</div>}
        </div>
      </section>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 800, margin: '0 auto', padding: '32px 24px', fontFamily: "'Inter', system-ui, sans-serif" },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 14, color: '#6b7280' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backLink: { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  builderBtn: { display: 'inline-block', padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#242424', color: '#fff', borderRadius: 8, textDecoration: 'none' },
  title: { fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 },
  subtitle: { fontSize: 14, color: '#6b7280', margin: '4px 0 0' },
  section: { marginTop: 32, paddingTop: 24, borderTop: '1px solid #e5e7eb' },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 },
  hint: { fontSize: 13, color: '#9ca3af', margin: '4px 0 0' },
  textarea: { width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' as const, marginTop: 8, boxSizing: 'border-box' as const },
  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  card: { padding: '16px 20px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' },
  cardTitle: { fontSize: 15, fontWeight: 600, color: '#111827' },
  cardDesc: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  cardMeta: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af', padding: 4 },
  addBtn: { marginTop: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#242424', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  platformBtn: { padding: '8px 16px', fontSize: 13, fontWeight: 500, border: '2px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#6b7280', fontFamily: 'inherit' },
  platformBtnActive: { borderColor: '#242424', background: '#242424', color: '#fff' },
  audienceRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' },
};
