import React from 'react';
import type { TemplateProps } from './types';

export function StatCalloutTemplate({ copyBlock, brandIdentity }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily, borderRadius: 8, overflow: 'hidden', backgroundColor: brandIdentity.colorPrimary, color: '#fff', padding: 32, textAlign: 'center' }}>
      {brandIdentity.logoUrl && <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 28, marginBottom: 16 }} />}
      <h2 style={{ margin: 0, fontSize: 48, fontWeight: 800, lineHeight: 1.1 }}>{copyBlock.headline}</h2>
      {copyBlock.subhead && <p style={{ margin: '16px 0 0', fontSize: 18, opacity: 0.9 }}>{copyBlock.subhead}</p>}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
        {copyBlock.primaryCta && (
          <span style={{ padding: '10px 20px', backgroundColor: brandIdentity.colorAccent, borderRadius: 4, fontSize: 14, fontWeight: 600 }}>
            {copyBlock.primaryCta}
          </span>
        )}
        {copyBlock.secondaryCta && (
          <span style={{ padding: '10px 20px', border: '1px solid #fff', borderRadius: 4, fontSize: 14 }}>
            {copyBlock.secondaryCta}
          </span>
        )}
      </div>
    </div>
  );
}
