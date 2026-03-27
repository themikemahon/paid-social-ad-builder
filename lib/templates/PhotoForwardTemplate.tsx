import React from 'react';
import type { TemplateProps } from './types';

export function PhotoForwardTemplate({ copyBlock, brandIdentity, imageUrl }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }}>
      <div style={{ position: 'relative', width: '100%', minHeight: 280 }}>
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: 280, backgroundColor: brandIdentity.colorSecondary }} />
        )}
      </div>
      <div style={{ padding: 16, backgroundColor: brandIdentity.colorPrimary, color: '#fff' }}>
        {brandIdentity.logoUrl && <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 24, marginBottom: 8 }} />}
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{copyBlock.headline}</h2>
        {copyBlock.subhead && <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.85 }}>{copyBlock.subhead}</p>}
        {copyBlock.primaryCta && (
          <span style={{ display: 'inline-block', marginTop: 12, padding: '6px 14px', backgroundColor: brandIdentity.colorAccent, borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
            {copyBlock.primaryCta}
          </span>
        )}
      </div>
    </div>
  );
}
