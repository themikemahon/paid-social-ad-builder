import React from 'react';
import type { TemplateProps } from './types';

export function QuestionHookTemplate({ copyBlock, brandIdentity, imageUrl }: TemplateProps) {
  return (
    <div style={{ width: '100%', fontFamily: brandIdentity.fontFamily, borderRadius: 8, overflow: 'hidden', backgroundColor: brandIdentity.colorPrimary, color: '#fff' }}>
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{copyBlock.headline}</h2>
      </div>
      {imageUrl && <img src={imageUrl} alt="" style={{ width: '100%', height: 200, objectFit: 'cover' }} />}
      <div style={{ padding: 20, backgroundColor: brandIdentity.colorSecondary }}>
        {brandIdentity.logoUrl && <img src={brandIdentity.logoUrl} alt={brandIdentity.brandName} style={{ height: 24, marginBottom: 8 }} />}
        {copyBlock.subhead && <p style={{ margin: 0, fontSize: 15 }}>{copyBlock.subhead}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {copyBlock.primaryCta && (
            <span style={{ padding: '8px 16px', backgroundColor: brandIdentity.colorAccent, borderRadius: 4, fontSize: 14, fontWeight: 600 }}>
              {copyBlock.primaryCta}
            </span>
          )}
          {copyBlock.secondaryCta && (
            <span style={{ padding: '8px 16px', border: '1px solid #fff', borderRadius: 4, fontSize: 14 }}>
              {copyBlock.secondaryCta}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
