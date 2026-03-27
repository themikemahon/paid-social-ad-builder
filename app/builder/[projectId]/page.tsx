'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import '../ad-styles.css';
import type { CopySet, CopyBlock, BrandIdentity, SocialPlatform, Workspace, AudiencePersona } from '@/lib/types';

interface Territory { id: string; name: string; description: string; }
interface GeneratedAd {
  id: string; copyBlockId: string; territoryId: string; personaId: string;
  platform: SocialPlatform; creativeFormat: string; personaName: string;
  postCopy: string; imageHeadline: string; imageSubhead: string;
  stripHeadline: string; stripCta: string; imageUrl: string | null;
  sourcePrimary: string; sourceSecondary: string; sourceCtaNative: string; sourceCtaCustom: string;
  copyNotes: string; approvalStatus: string;
}

/* ═══ PLATFORM CHARACTER LIMITS ═══ */
const PLATFORM_LIMITS = {
  linkedin: { postCopy: 600, imageHeadline: 70, stripHeadline: 70, stripCta: 25, description: 100 },
  meta:     { postCopy: 125, imageHeadline: 40, stripHeadline: 40, stripCta: 20, description: 30 },
  reddit:   { postCopy: 300, imageHeadline: 300, stripCta: 30, description: 500 },
} as const;

/* Messaging block input limits (most restrictive across platforms) */
const INPUT_LIMITS = { headline: 125, subhead: 300, primaryCta: 20, secondaryCta: 25 };

function sanitizeText(text: string): string {
  return text.replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ');
}

function CharCounter({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const cls = len > max ? 'char-counter over' : len > max * 0.9 ? 'char-counter warn' : 'char-counter';
  return <div className={cls}>{len}/{max}</div>;
}

function hdrs(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem('auth_token');
    const w = localStorage.getItem('current_workspace_id');
    if (t) h['Authorization'] = `Bearer ${t}`;
    if (w) h['x-workspace-id'] = w;
  }
  return h;
}

const PLATFORM_LABELS: Record<string, string> = { linkedin: 'LinkedIn', meta: 'Meta (Facebook / Instagram)', reddit: 'Reddit' };
const PLATFORM_KEYS = ['linkedin', 'meta', 'reddit'] as const;

const HEADER_LOGOS: Record<string, React.ReactNode> = {
  linkedin: <svg className="col-logo" viewBox="0 0 24 24" width="18" height="18" fill="#999"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  meta: <svg className="col-logo" viewBox="0 0 24 24" width="18" height="18" fill="#999"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  reddit: <svg className="col-logo" viewBox="0 0 24 24" width="18" height="18" fill="#999"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 00.029-.463.33.33 0 00-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z"/></svg>,
};

const COLLAPSED_LOGOS: Record<string, React.ReactNode> = {
  linkedin: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  meta: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  reddit: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 00.029-.463.33.33 0 00-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z"/></svg>,
};

const EYE_ICON = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

export default function AdBuilderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const projectNameFromUrl = searchParams.get('name') || '';

  const [project, setProject] = useState<{ name: string; workspaceId: string; enabledPlatforms: SocialPlatform[] } | null>(null);
  const [brand, setBrand] = useState<BrandIdentity | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [personas, setPersonas] = useState<AudiencePersona[]>([]);
  const [activeTerritory, setActiveTerritory] = useState('all');
  const [activeAudience, setActiveAudience] = useState('all');
  const [copySets, setCopySets] = useState<CopySet[]>([]);
  const [ads, setAds] = useState<GeneratedAd[]>([]);
  const [copyPanelOpen, setCopyPanelOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [msgTerritoryFilter, setMsgTerritoryFilter] = useState('all');
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; headline: string } | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [colContentHidden, setColContentHidden] = useState<Set<string>>(new Set());
  const [generatingCopy, setGeneratingCopy] = useState<string | null>(null);
  const [generatingAds, setGeneratingAds] = useState<string | null>(null);
  const [freshBlockIds, setFreshBlockIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const h = hdrs();
      const projRes = await fetch(`/api/projects/${projectId}`, { headers: h });
      if (!projRes.ok) return;
      const proj = await projRes.json();
      setProject({ name: proj.name, workspaceId: proj.workspaceId, enabledPlatforms: proj.enabledPlatforms || ['linkedin', 'meta', 'reddit'] });
      try { localStorage.setItem(`project_name_${projectId}`, proj.name); } catch {};

      const wh = hdrs({ 'x-workspace-id': proj.workspaceId });
      const [wsRes, terrRes, csRes, adsRes, personaRes] = await Promise.all([
        fetch(`/api/workspaces/${proj.workspaceId}`, { headers: wh }),
        fetch(`/api/territories?project_id=${projectId}`, { headers: wh }),
        fetch(`/api/copy-sets?project_id=${projectId}`, { headers: wh }),
        fetch(`/api/generated-ads?project_id=${projectId}`, { headers: wh }),
        fetch(`/api/personas?workspace_id=${proj.workspaceId}`, { headers: wh }),
      ]);

      if (wsRes.ok) {
        const ws: Workspace = await wsRes.json();
        setBrand({ brandName: ws.brandName, logoUrl: ws.logoUrl, colorPrimary: ws.colorPrimary || '#FEEB29', colorSecondary: ws.colorSecondary || '#242424', colorAccent: ws.colorAccent || '#0066CC', fontFamily: ws.fontFamily || 'Inter' });
      }
      if (terrRes.ok) setTerritories(await terrRes.json());
      if (personaRes.ok) setPersonas(await personaRes.json());
      if (csRes.ok) {
        const sets: CopySet[] = await csRes.json();
        const withBlocks = await Promise.all(sets.map(async cs => {
          const cbRes = await fetch(`/api/copy-blocks?copy_set_id=${cs.id}`, { headers: wh });
          return { ...cs, copyBlocks: cbRes.ok ? await cbRes.json() : [] };
        }));
        setCopySets(withBlocks);
      }
      if (adsRes.ok) setAds(await adsRes.json());
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBlockFieldChange = useCallback((blockId: string, field: string, value: string) => {
    // Optimistic local update
    setCopySets(prev => prev.map(cs => ({
      ...cs,
      copyBlocks: (cs.copyBlocks ?? []).map((cb: CopyBlock) =>
        cb.id === blockId ? { ...cb, [field]: value } : cb
      ),
    })));

    // Debounced save
    const timerKey = `${blockId}-${field}`;
    if (debounceTimers.current[timerKey]) clearTimeout(debounceTimers.current[timerKey]);
    debounceTimers.current[timerKey] = setTimeout(async () => {
      const apiField = field === 'primaryCta' ? 'primary_cta' : field === 'secondaryCta' ? 'secondary_cta' : field === 'territoryId' ? 'territory_id' : field === 'personaId' ? 'persona_id' : field;
      try {
        await fetch(`/api/copy-blocks/${blockId}`, {
          method: 'PUT',
          headers: hdrs({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ [apiField]: value }),
        });
      } catch { /* silently fail */ }
    }, 2000);
  }, []);

  const handleAddBlock = useCallback(async (copySetId: string) => {
    try {
      // Compute sort_order as max across ALL blocks + 1
      const allBlocks = copySets.flatMap(cs => cs.copyBlocks ?? []);
      const maxSort = allBlocks.reduce((max, cb) => Math.max(max, cb.sortOrder ?? 0), 0);
      const res = await fetch('/api/copy-blocks', {
        method: 'POST',
        headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ copy_set_id: copySetId, headline: '', subhead: '', primary_cta: '', secondary_cta: '', creative_format: 'standard-hero', sort_order: maxSort + 1 }),
      });
      if (res.ok) {
        const newBlock: CopyBlock = await res.json();
        setCopySets(prev => prev.map(cs =>
          cs.id === copySetId ? { ...cs, copyBlocks: [...(cs.copyBlocks ?? []), newBlock] } : cs
        ));
        setExpandedBlockId(newBlock.id);
        setTimeout(() => {
          const el = document.querySelector('.msg-card-expanded');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    } catch { /* silently fail */ }
  }, [copySets]);

  const handleGenerateCopy = useCallback(async (blockId: string) => {
    setGeneratingCopy(blockId);
    try {
      // Find the block to get its personaId
      const block = copySets.flatMap(cs => cs.copyBlocks ?? []).find((cb: CopyBlock) => cb.id === blockId);
      const personaId = block ? (block as unknown as Record<string, string>).personaId : undefined;
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ copyBlockId: blockId, targetPlatform: 'linkedin', ...(personaId ? { personaId } : {}) }),
      });
      if (res.ok) {
        const fields = await res.json();
        // Only update copy fields, not territory/audience
        const copyFields = { headline: fields.headline, subhead: fields.subhead, primaryCta: fields.primaryCta, secondaryCta: fields.secondaryCta };
        // Update local state
        setCopySets(prev => prev.map(cs => ({
          ...cs,
          copyBlocks: (cs.copyBlocks ?? []).map((cb: CopyBlock) =>
            cb.id === blockId ? { ...cb, ...copyFields } : cb
          ),
        })));
        // Persist each field
        for (const [field, value] of Object.entries(copyFields)) {
          const apiField = field === 'primaryCta' ? 'primary_cta' : field === 'secondaryCta' ? 'secondary_cta' : field;
          await fetch(`/api/copy-blocks/${blockId}`, {
            method: 'PUT',
            headers: hdrs({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ [apiField]: value }),
          });
        }
      }
    } catch { /* silently fail */ }
    finally { setGeneratingCopy(null); }
  }, []);

  const handleGenerateAds = useCallback(async (blockId: string) => {
    setGeneratingAds(blockId);
    try {
      const res = await fetch('/api/generate-ads', {
        method: 'POST',
        headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ copyBlockId: blockId }),
      });
      if (res.ok) {
        setFreshBlockIds(prev => new Set(prev).add(blockId));
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Generate ads failed:', res.status, err);
      }
    } catch (e) { console.error('Generate ads error:', e); }
    finally { setGeneratingAds(null); }
  }, [fetchData]);

  const handleDeleteAd = useCallback(async (adId: string) => {
    try {
      await fetch(`/api/generated-ads/${adId}`, { method: 'DELETE', headers: hdrs() });
      setAds(prev => prev.filter(a => a.id !== adId));
    } catch { /* silently fail */ }
  }, []);

  // Filter copy sets based on messaging panel territory filter
  const filteredCopySets = msgTerritoryFilter === 'all'
    ? copySets
    : copySets.filter(cs => {
        // Match copy sets whose name contains the territory name
        const terr = territories.find(t => t.id === msgTerritoryFilter);
        return terr ? cs.name.toLowerCase().includes(terr.name.toLowerCase()) : true;
      });

  const cachedProjectName = typeof window !== 'undefined' ? localStorage.getItem(`project_name_${projectId}`) || '' : '';
  const projectName = project?.name || projectNameFromUrl || cachedProjectName || '';

  if (loading || !project || !brand) {
    return (
      <div className="builder-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div className="page-header">
          <h1>
            <span style={{ color: '#242424', textDecoration: 'none' }}>Paid Social Ad Builder</span>
            <span className="sep">/</span>
            <span className="file-name">{projectName}</span>
          </h1>
          <div className="header-filter">
            <select className="audience-dropdown"><option>All Territories</option></select>
            <select className="audience-dropdown"><option>All Audiences</option></select>
            <button className="filter-btn" onClick={() => setCopyPanelOpen(!copyPanelOpen)}>
              {copyPanelOpen ? 'Hide Messaging' : 'Show Messaging'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div className={`msg-panel${copyPanelOpen ? '' : ' msg-panel-hidden'}`}>
            <div className="msg-panel-header">Messaging Blocks</div>
            <div className="msg-panel-body">
              {[1,2,3].map(i => <div key={i} className="skeleton skeleton-card" />)}
            </div>
          </div>
          <div className="columns-container">
            {PLATFORM_KEYS.map(key => (
              <div key={key} className="column">
                <div className="column-header">
                  <div className="column-header-inner">
                    <h2>{HEADER_LOGOS[key]}{PLATFORM_LABELS[key]}</h2>
                    <div className="col-count" style={{ color: '#ddd' }}>—</div>
                  </div>
                  <button className="col-collapse-btn" title="Hide column">{EYE_ICON}</button>
                </div>
                <div style={{ padding: '0 8px' }}>
                  {[1,2].map(i => <div key={i} className="skeleton skeleton-ad" />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const ep = project.enabledPlatforms;
  const filteredAds = ads.filter(a => {
    if (activeTerritory !== 'all' && a.territoryId !== activeTerritory) return false;
    if (activeAudience !== 'all' && a.personaName !== activeAudience) return false;
    return true;
  });

  const adsByPlatform: Record<string, GeneratedAd[]> = {};
  for (const p of ep) adsByPlatform[p] = filteredAds.filter(a => a.platform === p);

  // Group ads by territory within each platform column
  const territoryOrder = territories.map(t => t.id);
  const territoryNames: Record<string, string> = {};
  territories.forEach(t => { territoryNames[t.id] = t.name; });

  const platformLabels = PLATFORM_LABELS;
  const platformHeaderLogos = HEADER_LOGOS;
  const platformCollapsedLogos = COLLAPSED_LOGOS;

  return (
    <div className="builder-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header">
        <h1>
          <a href={`/project/${projectId}`} style={{ color: '#242424', textDecoration: 'none' }}>Paid Social Ad Builder</a>
          <span className="sep">/</span>
          <span className="file-name">{project.name}</span>
        </h1>
        <div className="header-filter">
          <select className="audience-dropdown" value={activeTerritory} onChange={e => setActiveTerritory(e.target.value)}>
            <option value="all">All Territories</option>
            {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="audience-dropdown" value={activeAudience} onChange={e => setActiveAudience(e.target.value)}>
            <option value="all">All Audiences</option>
            {personas.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <button className="filter-btn" onClick={() => setCopyPanelOpen(!copyPanelOpen)}>
            {copyPanelOpen ? 'Hide Messaging' : 'Show Messaging'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Messaging Blocks Panel */}
        <div className={`msg-panel${copyPanelOpen ? '' : ' msg-panel-hidden'}`}>
            <div className="msg-panel-header">Messaging Blocks</div>
            <div className="msg-panel-body">
              {/* Flat list of all copy blocks as cards */}
              {copySets.flatMap(cs => (cs.copyBlocks ?? []).map((cb: CopyBlock) => ({ ...cb, _copySetId: cs.id }))).map((cb: CopyBlock & { _copySetId: string }) => {
                const isExpanded = expandedBlockId === cb.id;
                return (
                  <div key={cb.id} className={`msg-card${isExpanded ? ' msg-card-expanded' : ''}`} onClick={() => {
                    setExpandedBlockId(isExpanded ? null : cb.id);
                  }}>
                    {isExpanded && (
                      <button className="msg-card-close-x" onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: cb.id, headline: cb.headline || 'this block' }); }} title="Delete block">✕</button>
                    )}
                    {isExpanded ? (
                      <div>
                        <div className="msg-field-label">Territory</div>
                        <select className="msg-card-territory" value={(cb as unknown as Record<string, string>).territoryId || ''} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); handleBlockFieldChange(cb.id, 'territoryId', e.target.value); }} title="Territory">
                          <option value="">Select Territory</option>
                          {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <div className="msg-field-label">Audience</div>
                        <select className="msg-card-territory" value={(cb as unknown as Record<string, string>).personaId || ''} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); handleBlockFieldChange(cb.id, 'personaId', e.target.value); }} title="Audience">
                          <option value="">All Audiences</option>
                          {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button className="msg-generate-btn" onClick={e => { e.stopPropagation(); handleGenerateCopy(cb.id); }} disabled={generatingCopy === cb.id}>
                          {generatingCopy === cb.id ? '⏳ Generating…' : '✨ Generate Copy'}
                        </button>
                        <div style={{ height: 16 }} />
                        <div className="msg-field-label">Primary</div>
                        <textarea className="msg-field-input" rows={4} value={cb.headline || ''} maxLength={INPUT_LIMITS.headline} onClick={e => e.stopPropagation()} onChange={e => handleBlockFieldChange(cb.id, 'headline', e.target.value)} placeholder="Primary messaging…" />
                        <CharCounter value={cb.headline || ''} max={INPUT_LIMITS.headline} />
                        <div className="msg-field-label">Secondary</div>
                        <textarea className="msg-field-input" rows={8} value={cb.subhead || ''} maxLength={INPUT_LIMITS.subhead} onClick={e => e.stopPropagation()} onChange={e => handleBlockFieldChange(cb.id, 'subhead', e.target.value)} placeholder="Secondary messaging…" />
                        <CharCounter value={cb.subhead || ''} max={INPUT_LIMITS.subhead} />
                        <div className="msg-field-label">CTA Native</div>
                        <input className="msg-field-input" value={cb.primaryCta || ''} maxLength={INPUT_LIMITS.primaryCta} onClick={e => e.stopPropagation()} onChange={e => handleBlockFieldChange(cb.id, 'primaryCta', e.target.value)} placeholder="e.g. Sign Up" />
                        <CharCounter value={cb.primaryCta || ''} max={INPUT_LIMITS.primaryCta} />
                        <div className="msg-field-label">CTA Custom</div>
                        <input className="msg-field-input" value={cb.secondaryCta || ''} maxLength={INPUT_LIMITS.secondaryCta} onClick={e => e.stopPropagation()} onChange={e => handleBlockFieldChange(cb.id, 'secondaryCta', e.target.value)} placeholder="e.g. Learn More" />
                        <CharCounter value={cb.secondaryCta || ''} max={INPUT_LIMITS.secondaryCta} />
                        <button className="msg-generate-btn" onClick={e => { e.stopPropagation(); handleGenerateAds(cb.id); }} disabled={generatingAds === cb.id}>
                          {generatingAds === cb.id ? '⏳ Generating…' : '✨ Generate Ads'}
                        </button>
                        <button className="msg-close-btn" onClick={e => { e.stopPropagation(); setExpandedBlockId(null); }}>Close</button>
                      </div>
                    ) : (
                      <div className="msg-card-preview">
                        <div className="msg-card-primary">{cb.headline || '(empty block)'}</div>
                        {cb.subhead && <div className="msg-card-secondary">{cb.subhead}</div>}
                        {cb.primaryCta && <div className="msg-card-cta">CTA: {cb.primaryCta}</div>}
                        {cb.headline && (
                          <button
                            className="msg-card-ai-btn"
                            title="Generate ads from this copy"
                            onClick={e => { e.stopPropagation(); handleGenerateAds(cb.id); }}
                            disabled={generatingAds === cb.id}
                          >
                            {generatingAds === cb.id
                              ? <span className="msg-card-ai-spinner">⏳</span>
                              : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 4 13 12 7 20"/><polyline points="14 4 20 12 14 20"/></svg>
                            }
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Single add button anchored at bottom */}
              <button className="msg-add-block-btn" onClick={() => {
                const firstSet = copySets[0];
                if (firstSet) handleAddBlock(firstSet.id);
              }}>
                <span className="msg-add-icon">+</span>
              </button>
            </div>
          </div>

        {/* Ad Columns */}
        <div className="columns-container">
          {ep.map(platform => {
            const platformAds = adsByPlatform[platform] || [];
            // Group by territory
            const grouped: Record<string, GeneratedAd[]> = {};
            platformAds.forEach(a => {
              const tid = a.territoryId || 'uncategorized';
              if (!grouped[tid]) grouped[tid] = [];
              grouped[tid].push(a);
            });

            return (
              <div key={platform} className={`column${collapsedCols.has(platform) ? ' collapsed' : ''}`} onClick={() => {
                if (collapsedCols.has(platform)) {
                  setCollapsedCols(prev => { const n = new Set(prev); n.delete(platform); return n; });
                }
              }}>
                <div className="col-collapsed-logo">{platformCollapsedLogos[platform]}</div>
                <div className="column-header">
                  <div className="column-header-inner">
                    <h2>{platformHeaderLogos[platform]}{platformLabels[platform] || platform}</h2>
                    <div className="col-count">{platformAds.length} ads</div>
                  </div>
                  <button className="col-collapse-btn" title="Hide column" onClick={e => {
                    e.stopPropagation();
                    setCollapsedCols(prev => { const n = new Set(prev); n.add(platform); return n; });
                  }}>
                    {EYE_ICON}
                  </button>
                </div>
                <div>
                {territoryOrder.map(tid => {
                  const tAds = grouped[tid];
                  if (!tAds || tAds.length === 0) return null;
                  return (
                    <React.Fragment key={tid}>
                      <div className="cat-separator"><h3>{territoryNames[tid]}</h3></div>
                      {tAds.map(ad => (
                        <AdBlock key={ad.id} ad={ad} brand={brand} platform={platform} territoryName={territoryNames[ad.territoryId] || ''} onDelete={handleDeleteAd} isFresh={freshBlockIds.has(ad.copyBlockId)} />
                      ))}
                    </React.Fragment>
                  );
                })}
                {grouped['uncategorized'] && grouped['uncategorized'].length > 0 && (
                  <React.Fragment>
                    <div className="cat-separator"><h3>Uncategorized</h3></div>
                    {grouped['uncategorized'].map(ad => (
                      <AdBlock key={ad.id} ad={ad} brand={brand} platform={platform} territoryName="" onDelete={handleDeleteAd} isFresh={freshBlockIds.has(ad.copyBlockId)} />
                    ))}
                  </React.Fragment>
                )}
                {platformAds.length === 0 && <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: '#9ca3af' }}>No ads yet</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delete copy block?</div>
            <div className="modal-body">
              This will permanently remove &ldquo;{deleteConfirm.headline.length > 50 ? deleteConfirm.headline.slice(0, 50) + '…' : deleteConfirm.headline}&rdquo; and cannot be undone.
            </div>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="modal-btn modal-btn-danger" onClick={async () => {
                await fetch(`/api/copy-blocks/${deleteConfirm.id}`, { method: 'DELETE', headers: hdrs() });
                setDeleteConfirm(null);
                setExpandedBlockId(null);
                fetchData();
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ PLATFORM ASPECT RATIOS ═══ */
const PLATFORM_RATIOS: Record<string, { label: string; css: string; value: number }[]> = {
  linkedin: [
    { label: '1.91:1', css: '1.91/1', value: 1.91 },
    { label: '1:1', css: '1/1', value: 1 },
    { label: '4:5', css: '4/5', value: 0.8 },
  ],
  meta: [
    { label: '1:1', css: '1/1', value: 1 },
    { label: '4:5', css: '4/5', value: 0.8 },
    { label: '9:16', css: '9/16', value: 0.5625 },
  ],
  reddit: [
    { label: '4:3', css: '4/3', value: 1.333 },
    { label: '1:1', css: '1/1', value: 1 },
    { label: '16:9', css: '16/9', value: 1.778 },
  ],
};

/** Given an image URL and platform, returns the nearest allowed aspect-ratio CSS string. */
function useImageRatio(imageUrl: string | null, platform: string): string | undefined {
  const [ratio, setRatio] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!imageUrl) { setRatio(undefined); return; }
    const img = new Image();
    img.onload = () => {
      const natural = img.naturalWidth / img.naturalHeight;
      const ratios = PLATFORM_RATIOS[platform] || PLATFORM_RATIOS.linkedin;
      let closest = ratios[0];
      let minDiff = Math.abs(natural - closest.value);
      for (const r of ratios) {
        const diff = Math.abs(natural - r.value);
        if (diff < minDiff) { minDiff = diff; closest = r; }
      }
      setRatio(closest.css);
    };
    img.src = imageUrl;
  }, [imageUrl, platform]);
  return ratio;
}

interface Comment {
  id: string;
  author: string;
  text: string;
  time: string;
  resolved: boolean;
}

function AdBlock({ ad, brand, platform, territoryName, onDelete, isFresh }: { ad: GeneratedAd; brand: BrandIdentity; platform: string; territoryName: string; onDelete?: (id: string) => void; isFresh?: boolean }) {
  const [showRef, setShowRef] = useState(false);
  const [locked, setLocked] = useState(true);
  const [approved, setApproved] = useState(false);
  const [ratioIdx, setRatioIdx] = useState(-1);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [highlightFade, setHighlightFade] = useState(false);
  const commentPanelRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  // Fade out the highlight after it's been visible for 3 seconds
  useEffect(() => {
    if (!isFresh || !blockRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        const timer = setTimeout(() => setHighlightFade(true), 3000);
        return () => clearTimeout(timer);
      }
    }, { threshold: 0.5 });
    observer.observe(blockRef.current);
    return () => observer.disconnect();
  }, [isFresh]);

  const ratios = PLATFORM_RATIOS[platform] || PLATFORM_RATIOS.linkedin;
  const userOverride = ratioIdx >= 0;
  const currentRatio = userOverride ? ratios[ratioIdx] : ratios[0];
  const hasUnresolved = comments.some(c => !c.resolved);

  const cycleRatio = () => {
    setRatioIdx(i => {
      const next = i < 0 ? 1 : (i + 1) % ratios.length;
      return next;
    });
  };

  const toggleComments = () => {
    const opening = !commentsOpen;
    setCommentsOpen(opening);
    if (opening) {
      setTimeout(() => {
        const panel = commentPanelRef.current;
        if (!panel) return;
        const column = panel.closest('.column');
        if (column) {
          const panelRect = panel.getBoundingClientRect();
          const colRect = column.getBoundingClientRect();
          column.scrollBy({ top: panelRect.bottom - colRect.bottom + 80, behavior: 'smooth' });
        }
      }, 80);
    }
  };

  const addComment = () => {
    const text = newComment.trim();
    if (!text) return;
    setComments(prev => [...prev, {
      id: crypto.randomUUID(),
      author: 'You',
      text,
      time: 'Just now',
      resolved: false,
    }]);
    setNewComment('');
  };

  const resolveComment = (id: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, resolved: !c.resolved } : c));
  };

  const deleteComment = (id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div ref={blockRef} className={`ad-block${approved ? ' approved-block' : ''}${isFresh ? ' just-generated' : ''}${highlightFade ? ' highlight-fade' : ''}`}>
      <div className="ad-lock-col">
        <button
          className={`lock-btn${locked ? ' locked' : ''}${approved ? ' finalized' : ''}`}
          title={locked ? 'Click to unlock editing' : 'Click to lock editing'}
          onClick={() => { if (!approved) setLocked(l => !l); }}
        >
          <svg className="icon-lock" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <svg className="icon-unlock" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
        </button>
        <button
          className="resize-btn"
          title={`Change aspect ratio (${currentRatio.label})`}
          onClick={cycleRatio}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          <span className="resize-label">{currentRatio.label}</span>
        </button>
        <button
          className={`comment-btn${hasUnresolved ? ' has-unresolved' : ''}`}
          title="Comments"
          onClick={toggleComments}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </button>
        <button
          className={`approve-btn${approved ? ' approved' : ''}`}
          title={approved ? 'Approved — click to undo' : 'Mark as ready for design'}
          onClick={() => {
            const next = !approved;
            setApproved(next);
            if (next) setLocked(true);
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        </button>
        {onDelete && (
          <button
            className="delete-ad-btn"
            title="Delete this ad"
            onClick={() => setDeletePrompt(true)}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      <div className="ad-content">
        {/* Tags */}
        <div className="ad-tag">
          {territoryName && <span className="tag-cat">{territoryName}</span>}
          {ad.personaName && <span className="tag-aud">{ad.personaName}</span>}
          <span className="tag-fmt">{ad.creativeFormat.replace(/-/g, ' ')}</span>
        </div>

        {/* Platform-specific card */}
        {platform === 'linkedin' && <LinkedInCard ad={ad} brand={brand} ratioOverride={userOverride ? currentRatio.css : undefined} />}
        {platform === 'meta' && <MetaCard ad={ad} brand={brand} ratioOverride={userOverride ? currentRatio.css : undefined} />}
        {platform === 'reddit' && <RedditCard ad={ad} brand={brand} ratioOverride={userOverride ? currentRatio.css : undefined} />}

        {/* Copy Reference */}
        <div className={`annotation ${showRef ? 'open' : ''}`}>
          <div className="annotation-toggle" onClick={() => setShowRef(!showRef)}>
            <span>Copy Reference &amp; Mapping</span>
            <span className="arrow">▶</span>
          </div>
          <div className="annotation-body">
            <span className="section-label">Source Copy</span>
            {ad.sourcePrimary && <div className="sc-row"><span className="sc-label">Primary:</span> {ad.sourcePrimary}</div>}
            {ad.sourceSecondary && <div className="sc-row"><span className="sc-label">Secondary:</span> {ad.sourceSecondary}</div>}
            {ad.sourceCtaNative && <div className="sc-row"><span className="sc-label">Native CTA:</span> {ad.sourceCtaNative}</div>}
            {ad.sourceCtaCustom && <div className="sc-row"><span className="sc-label">Custom CTA:</span> {ad.sourceCtaCustom}</div>}
            {ad.copyNotes && <><span className="section-label">Copy Notes</span><div className="sc-row">{ad.copyNotes}</div></>}
          </div>
        </div>

        {/* Comment Panel */}
        <div ref={commentPanelRef} className={`comment-panel${commentsOpen ? ' open' : ''}`}>
          <div className="comment-list">
            {comments.length === 0 && <div className="comment-empty">No comments yet</div>}
            {comments.map(c => (
              <div key={c.id} className={`comment-item${c.resolved ? ' resolved' : ''}`}>
                <div>
                  <span className="comment-author">{c.author}</span>
                  <span className="comment-time">{c.time}</span>
                  {c.resolved && <span className="comment-resolved-label">RESOLVED</span>}
                </div>
                <div className="comment-msg">{c.text}</div>
                <div className="comment-actions">
                  <button className="comment-resolve-btn" onClick={() => resolveComment(c.id)} title={c.resolved ? 'Unresolve' : 'Resolve'}>✓</button>
                  <button className="comment-delete-btn" onClick={() => deleteComment(c.id)} title="Delete">🗑</button>
                </div>
              </div>
            ))}
          </div>
          <div className="comment-input-row">
            <input
              className="comment-input"
              placeholder="Add a comment..."
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
            />
            <button className="comment-send-btn" onClick={addComment}>Send</button>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {deletePrompt && (
        <div className="modal-overlay" onClick={() => setDeletePrompt(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delete this ad?</div>
            <div className="modal-body">This will permanently remove this ad from the board. This cannot be undone.</div>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={() => setDeletePrompt(false)}>Cancel</button>
              <button className="modal-btn modal-btn-danger" onClick={() => { setDeletePrompt(false); onDelete?.(ad.id); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormatImageContent({ format, ad, brand, platform }: { format: string; ad: GeneratedAd; brand: BrandIdentity; platform: string }) {
  const imgHl = sanitizeText(ad.imageHeadline || '');
  const imgSub = sanitizeText(ad.imageSubhead || '');

  if (!imgHl && (format === 'standard-hero' || format === 'photo-forward')) {
    const dims = platform === 'linkedin' ? '1200 × 628' : platform === 'meta' ? '1080 × 1080' : '1200 × 628';
    return (
      <div className="img-content">
        <div className="img-placeholder">[Photo + Product UI — {dims}]</div>
      </div>
    );
  }

  switch (format) {
    case 'stat-callout':
      return (
        <div className="img-content">
          {imgHl && <div className="stat-number">{imgHl}</div>}
          {imgSub && <div className="stat-context">{imgSub}</div>}
          {ad.stripHeadline && <div className="stat-source">{sanitizeText(ad.stripHeadline)}</div>}
        </div>
      );

    case 'comparison':
      return (
        <div className="compare-container">
          <div className="compare-side compare-left">
            <div className="compare-label">Before</div>
            <div className="compare-icon">😩</div>
            {imgHl && <div className="compare-points">{imgHl}</div>}
          </div>
          <div className="compare-divider"><div className="compare-vs">VS</div></div>
          <div className="compare-side compare-right">
            <div className="compare-label">After</div>
            <div className="compare-icon">✨</div>
            {imgSub && <div className="compare-points">{imgSub}</div>}
          </div>
        </div>
      );

    case 'question-hook':
      return (
        <>
          <div className="qh-photo-bg" />
          <div className="qh-photo-overlay" />
          <div className="qh-photo-text">
            {imgHl && <div className="question-big">{imgHl}</div>}
            {imgSub && <div className="question-small">{imgSub}</div>}
          </div>
        </>
      );

    case 'text-post':
      return (
        <div className={`textpost-card${platform === 'reddit' ? ' textpost-reddit' : ''}`}>
          <div className="tp-header">
            <div className="tp-avatar">{brand.brandName.charAt(0)}</div>
            <div>
              <div className="tp-name">{brand.brandName}</div>
              <div className="tp-role">Professional</div>
            </div>
          </div>
          <div className="tp-body">{imgHl}{imgSub ? `\n\n${imgSub}` : ''}</div>
        </div>
      );

    case 'meme':
      return (
        <div className="meme-container">
          {imgHl && <div className="meme-top">{imgHl}</div>}
          <div className="meme-bottom">
            {imgSub?.split('\n').map((line, i, arr) =>
              i === arr.length - 1
                ? <div key={i} className="meme-punchline">{sanitizeText(line)}</div>
                : <div key={i} className="meme-line">{sanitizeText(line)}</div>
            )}
          </div>
        </div>
      );

    case 'notes-app':
      return (
        <div className="notes-phone">
          <div className="notes-statusbar"><span>9:41</span><span>📶 🔋</span></div>
          <div className="notes-header"><span className="notes-back">← Notes</span><span className="notes-done">Done</span></div>
          <div className="notes-body">
            {imgHl && <div className="notes-title">{imgHl}</div>}
            {imgSub && <div className="notes-text">{imgSub}</div>}
            <div className="notes-link">🔗 revamp.norton.com</div>
          </div>
        </div>
      );

    case 'notification':
      return (
        <div className="notif-phone">
          <div className="notif-statusbar"><span>9:41</span><span>📶 🔋</span></div>
          <div className="notif-banner">
            <div className="notif-app-icon" style={{ width: 32, height: 32, borderRadius: 8, background: brand.colorPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: brand.colorSecondary }}>{brand.brandName.charAt(0)}</div>
            <div className="notif-text">
              <div className="notif-app-name">{brand.brandName}</div>
              {imgHl && <div className="notif-title">{imgHl}</div>}
            </div>
            <div className="notif-time">now</div>
          </div>
          <div className="notif-wallpaper-text">{imgSub || 'Slide to unlock'}</div>
        </div>
      );

    case 'imessage':
      return (
        <div className="imessage-phone">
          <div className="imessage-statusbar"><span>9:41</span><span>📶 🔋</span></div>
          <div className="imessage-header">Messages</div>
          <div className="imessage-body">
            {imgHl && <div className="imessage-bubble imessage-them">{imgHl}</div>}
            {imgSub && <div className="imessage-bubble imessage-me">{imgSub}</div>}
          </div>
        </div>
      );

    case 'photo-forward':
    case 'standard-hero':
    default:
      if (!imgHl) return null;
      return (
        <div className="img-content">
          <div className="hero-hl">{imgHl}</div>
          {imgSub && <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>{imgSub}</div>}
        </div>
      );
  }
}

function liImgClass(format: string): string {
  const map: Record<string, string> = {
    'standard-hero': 'li-img-hero', 'photo-forward': 'li-img-photo', 'question-hook': 'li-img-question',
    'stat-callout': 'li-img-stat', 'text-post': 'li-img-textpost', 'comparison': 'li-img-compare',
  };
  return map[format] || 'li-img-hero';
}

function LinkedInCard({ ad, brand, ratioOverride }: { ad: GeneratedAd; brand: BrandIdentity; ratioOverride?: string }) {
  const fmt = ad.creativeFormat || 'standard-hero';
  const lim = PLATFORM_LIMITS.linkedin;
  const postCopy = sanitizeText(ad.postCopy || '').slice(0, lim.postCopy);
  const stripHl = sanitizeText(ad.stripHeadline || '').slice(0, lim.stripHeadline);
  const stripCta = sanitizeText(ad.stripCta || '').slice(0, lim.stripCta);
  const imgRatio = useImageRatio(ad.imageUrl || null, 'linkedin');
  const effectiveRatio = ratioOverride || imgRatio;

  return (
    <div className="li-card">
      <div className="li-head">
        <div className="li-logo" style={{ background: brand.colorPrimary }}>
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
            <span style={{ color: brand.colorSecondary, fontWeight: 800, fontSize: 20 }}>{brand.brandName.charAt(0)}</span>}
        </div>
        <div className="li-meta">
          <div className="name">{brand.brandName}</div>
          <div className="sub">1,204,587 followers</div>
          <div className="promo">Promoted</div>
        </div>
      </div>
      {postCopy && <div className="li-intro">{postCopy}</div>}
      <div className={`li-img ${liImgClass(fmt)}${ad.imageUrl ? ' has-dropped-img' : ''}`} style={{ position: 'relative', ...(effectiveRatio ? { aspectRatio: effectiveRatio } : {}) }}>
        {ad.imageUrl && <img className="dropped-img" src={ad.imageUrl} alt="" />}
        {!ad.imageUrl && <FormatImageContent format={fmt} ad={ad} brand={brand} platform="linkedin" />}
      </div>
      {(stripHl || stripCta || true) && (
        <div className="li-strip">
          <div className="li-strip-text">
            <div className="hl">{stripHl || 'Build the online presence that gets you noticed'}</div>
            <div className="desc">revamp.norton.com</div>
          </div>
          <button className="li-cta">{stripCta || 'Sign Up'}</button>
        </div>
      )}
      <div className="li-engage">
        <div className="rxn"><span style={{ background: '#378fe9' }}>👍</span><span style={{ background: '#e74c3c' }}>❤️</span><span style={{ background: '#44b37f' }}>🌿</span></div>
        <span style={{ marginLeft: 4 }}>2,847</span>
      </div>
      <div className="li-bar">
        <span>👍 Like</span><span>💬 Comment</span><span>🔄 Repost</span><span>📤 Send</span>
      </div>
    </div>
  );
}

function fbImgClass(format: string): string {
  const map: Record<string, string> = {
    'standard-hero': 'fb-img-hero', 'photo-forward': 'fb-img-photo', 'question-hook': 'fb-img-question',
    'stat-callout': 'fb-img-stat', 'notification': 'fb-img-notif', 'comparison': 'fb-img-compare',
    'imessage': 'fb-img-imessage',
  };
  return map[format] || 'fb-img-hero';
}

function MetaCard({ ad, brand, ratioOverride }: { ad: GeneratedAd; brand: BrandIdentity; ratioOverride?: string }) {
  const fmt = ad.creativeFormat || 'standard-hero';
  const lim = PLATFORM_LIMITS.meta;
  const postCopy = sanitizeText(ad.postCopy || '').slice(0, lim.postCopy);
  const stripHl = sanitizeText(ad.stripHeadline || '').slice(0, lim.stripHeadline);
  const stripCta = sanitizeText(ad.stripCta || '').slice(0, lim.stripCta);
  const imgRatio = useImageRatio(ad.imageUrl || null, 'meta');
  const effectiveRatio = ratioOverride || imgRatio;

  return (
    <div className="fb-card">
      <div className="fb-head">
        <div className="fb-logo" style={{ background: brand.colorPrimary }}>
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
            <span style={{ color: brand.colorSecondary, fontWeight: 800, fontSize: 16 }}>{brand.brandName.charAt(0)}</span>}
        </div>
        <div className="fb-meta">
          <div className="name">{brand.brandName}</div>
          <div className="sub">Sponsored · 🌐</div>
        </div>
        <div className="fb-dots">···</div>
      </div>
      {postCopy && <div className="fb-primary">{postCopy}</div>}
      <div className={`fb-img ${fbImgClass(fmt)}${ad.imageUrl ? ' has-dropped-img' : ''}`} style={{ position: 'relative', ...(effectiveRatio ? { aspectRatio: effectiveRatio } : {}) }}>
        {ad.imageUrl && <img className="dropped-img" src={ad.imageUrl} alt="" />}
        {!ad.imageUrl && <FormatImageContent format={fmt} ad={ad} brand={brand} platform="meta" />}
      </div>
      {(stripHl || stripCta || true) && (
        <div className="fb-strip">
          <div className="fb-strip-text">
            <div className="url">REVAMP.NORTON.COM</div>
            <div className="hl">{stripHl || 'Build your online presence'}</div>
            <div className="desc">Powered by Norton.</div>
          </div>
          <button className="fb-cta">{stripCta || 'Sign Up'}</button>
        </div>
      )}
      <div className="fb-bar">
        <span>👍 Like</span><span>💬 Comment</span><span>↗️ Share</span>
      </div>
    </div>
  );
}

function rdImgClass(format: string): string {
  const map: Record<string, string> = {
    'standard-hero': 'rd-img-hero', 'comparison': 'rd-img-compare', 'meme': 'rd-img-meme',
    'question-hook': 'rd-img-question', 'notes-app': 'rd-img-notes', 'imessage': 'rd-img-imessage',
    'text-post': 'rd-img-textpost',
  };
  return map[format] || 'rd-img-hero';
}

function RedditCard({ ad, brand, ratioOverride }: { ad: GeneratedAd; brand: BrandIdentity; ratioOverride?: string }) {
  const fmt = ad.creativeFormat || 'standard-hero';
  const lim = PLATFORM_LIMITS.reddit;
  const postCopy = sanitizeText(ad.postCopy || '').slice(0, lim.postCopy);
  const ctaText = sanitizeText(ad.sourceCtaNative || ad.stripCta || '').slice(0, lim.stripCta);
  const imgRatio = useImageRatio(ad.imageUrl || null, 'reddit');
  const effectiveRatio = ratioOverride || imgRatio;

  return (
    <div className="rd-card">
      <div className="rd-head">
        <div className="rd-logo" style={{ background: brand.colorPrimary }}>
          {brand.logoUrl ? <img src={brand.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
            <span style={{ color: brand.colorSecondary, fontWeight: 800, fontSize: 12 }}>{brand.brandName.charAt(0)}</span>}
        </div>
        <div className="rd-meta">
          <span className="user">u/{brand.brandName.replace(/\s+/g, '')}</span>
          <span className="promo">Promoted</span>
        </div>
      </div>
      {postCopy && <div className="rd-headline">{postCopy.length > 120 ? postCopy.slice(0, 120) + '…' : postCopy}</div>}
      {(ad.imageUrl || ad.imageHeadline) && (
        <div className={`rd-img ${rdImgClass(fmt)}${ad.imageUrl ? ' has-dropped-img' : ''}`} style={{ position: 'relative', ...(effectiveRatio ? { aspectRatio: effectiveRatio } : {}) }}>
          {ad.imageUrl && <img className="dropped-img" src={ad.imageUrl} alt="" />}
          {!ad.imageUrl && <FormatImageContent format={fmt} ad={ad} brand={brand} platform="reddit" />}
        </div>
      )}
      <div className="rd-bottom">
        <div className="rd-actions">
          <span>⬆ Vote</span><span>💬 Comment</span><span>↗️ Share</span>
        </div>
        <button className="rd-cta">{ctaText || 'Sign Up'}</button>
      </div>
    </div>
  );
}
