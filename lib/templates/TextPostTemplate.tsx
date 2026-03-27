import React from 'react';
import type { TemplateProps } from './types';

export function TextPostTemplate({ copyBlock, brandIdentity }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily, borderRadius: 8, backgroundColor: '#fff', border: '1px solid #e0e0e0', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {brandIdentity.logoUrl && <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 36, width: 36, borderRadius: '50%', objectFit: 'cover' }} />}
        <span style={{ fontWeight: 600, fontSize: 14, color: brandIdentity.colorPrimary }}>{brandIdentity.brandName}</span>
      </div>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>{copyBlock.headline}</h2>
      {copyBlock.subhead && <p style={{ margin: '8px 0 0', fontSize: 15, color: '#444', lineHeight: 1.5 }}>{copyBlock.subhead}</p>}
      {(copyBlock.primaryCta || copyBlock.secondaryCta) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e0e0e0', display: 'flex', gap: 8 }}>
          {copyBlock.primaryCta && (
            <span style={{ padding: '6px 14px', backgroundColor: brandIdentity.colorPrimary, color: '#fff', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
              {copyBlock.primaryCta}
            </span>
          )}
          {copyBlock.secondaryCta && (
            <span style={{ padding: '6px 14px', color: brandIdentity.colorPrimary, border: `1px solid ${brandIdentity.colorPrimary}`, borderRadius: 4, fontSize: 13 }}>
              {copyBlock.secondaryCta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
