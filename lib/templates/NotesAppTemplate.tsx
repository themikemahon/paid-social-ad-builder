import React from 'react';
import type { TemplateProps } from './types';

export function NotesAppTemplate({ copyBlock, brandIdentity }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fefce8', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ padding: '8px 16px', backgroundColor: '#f5f5f4', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
        {brandIdentity.logoUrl && <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 16 }} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#78716c' }}>Notes</span>
      </div>
      <div style={{ padding: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1c1917' }}>{copyBlock.headline}</h2>
        {copyBlock.subhead && <p style={{ margin: '12px 0 0', fontSize: 15, color: '#44403c', lineHeight: 1.6 }}>{copyBlock.subhead}</p>}
        {copyBlock.primaryCta && (
          <p style={{ margin: '12px 0 0', fontSize: 14, color: brandIdentity.colorPrimary, fontWeight: 600 }}>
            → {copyBlock.primaryCta}
          </p>
        )}
        {copyBlock.secondaryCta && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#78716c' }}>{copyBlock.secondaryCta}</p>
        )}
      </div>
    </div>
  );
}
