'use client';

import React, { useState } from 'react';
import type { AudiencePersona } from '@/lib/types';

interface PersonaFormProps {
  workspaceId: string;
  persona?: AudiencePersona | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function PersonaForm({ workspaceId, persona, onSaved, onCancel }: PersonaFormProps) {
  const isEditing = !!persona;
  const [name, setName] = useState(persona?.name ?? '');
  const [painPoints, setPainPoints] = useState(persona?.painPoints?.join('\n') ?? '');
  const [motivations, setMotivations] = useState(persona?.motivations?.join('\n') ?? '');
  const [demographics, setDemographics] = useState(
    persona?.demographics ? JSON.stringify(persona.demographics, null, 2) : '{}'
  );
  const [platformBehavior, setPlatformBehavior] = useState(
    persona?.platformBehavior ? JSON.stringify(persona.platformBehavior, null, 2) : '{}'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    let parsedDemographics: Record<string, unknown>;
    let parsedPlatformBehavior: Record<string, string>;
    try {
      parsedDemographics = JSON.parse(demographics);
    } catch {
      setError('Demographics must be valid JSON');
      return;
    }
    try {
      parsedPlatformBehavior = JSON.parse(platformBehavior);
    } catch {
      setError('Platform behavior must be valid JSON');
      return;
    }

    setSaving(true);
    setError(null);

    const body = {
      workspace_id: workspaceId,
      name: name.trim(),
      demographics: parsedDemographics,
      pain_points: painPoints.split('\n').map((s) => s.trim()).filter(Boolean),
      motivations: motivations.split('\n').map((s) => s.trim()).filter(Boolean),
      platform_behavior: parsedPlatformBehavior,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const url = isEditing ? `/api/personas/${persona!.id}` : '/api/personas';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save persona');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.formTitle}>{isEditing ? 'Edit Persona' : 'New Persona'}</div>

      <label style={styles.label}>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={styles.input}
          placeholder="e.g. Enterprise IT Decision Maker"
        />
      </label>

      <label style={styles.label}>
        Pain Points (one per line)
        <textarea
          value={painPoints}
          onChange={(e) => setPainPoints(e.target.value)}
          style={styles.textarea}
          rows={3}
          placeholder="Budget constraints&#10;Complex procurement"
        />
      </label>

      <label style={styles.label}>
        Motivations (one per line)
        <textarea
          value={motivations}
          onChange={(e) => setMotivations(e.target.value)}
          style={styles.textarea}
          rows={3}
          placeholder="ROI improvement&#10;Risk reduction"
        />
      </label>

      <label style={styles.label}>
        Demographics (JSON)
        <textarea
          value={demographics}
          onChange={(e) => setDemographics(e.target.value)}
          style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: 12 }}
          rows={3}
        />
      </label>

      <label style={styles.label}>
        Platform Behavior (JSON)
        <textarea
          value={platformBehavior}
          onChange={(e) => setPlatformBehavior(e.target.value)}
          style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: 12 }}
          rows={3}
        />
      </label>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.actions}>
        <button type="button" onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
        <button type="submit" disabled={saving} style={styles.saveBtn}>
          {saving ? 'Saving…' : isEditing ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '20px 24px',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 4,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    padding: '8px 10px',
    fontSize: 13,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    padding: '8px 10px',
    fontSize: 13,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  error: {
    fontSize: 12,
    color: '#dc2626',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  cancelBtn: {
    padding: '8px 16px',
    fontSize: 13,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    color: '#374151',
    fontFamily: 'inherit',
  },
  saveBtn: {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: '#242424',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
