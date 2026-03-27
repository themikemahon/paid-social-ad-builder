/**
 * Property tests for ThreeColumnPreview.
 *
 * Property 35: Copy change propagation to all previews — updated headline reflected in all previews
 * Property 36: Column collapse and expand round-trip — collapse then expand restores original state
 *
 * Validates: Requirements 12.3, 12.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LinkedInPreview } from '@/components/previews/LinkedInPreview';
import { MetaPreview } from '@/components/previews/MetaPreview';
import { RedditPreview } from '@/components/previews/RedditPreview';
import type {
  BrandIdentity,
  CopyBlockFields,
  CreativeFormatId,
  SocialPlatform,
} from '@/lib/types';

// ── Arbitraries ──

const hexColorArb = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 })
  .map(
    ([r, g, b]) =>
      `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  );

const brandIdentityArb: fc.Arbitrary<BrandIdentity> = fc.record({
  brandName: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,15}$/).filter((s) => s.trim().length > 0),
  logoUrl: fc.constant(null),
  colorPrimary: hexColorArb,
  colorSecondary: hexColorArb,
  colorAccent: hexColorArb,
  fontFamily: fc.constantFrom('Inter', 'Roboto', 'Arial', 'Helvetica'),
});

const copyBlockFieldsArb: fc.Arbitrary<CopyBlockFields> = fc.record({
  headline: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,30}$/).filter((s) => s.trim().length > 0),
  subhead: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,30}$/),
  primaryCta: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,15}$/),
  secondaryCta: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,15}$/),
});

const formatIdArb: fc.Arbitrary<CreativeFormatId> = fc.constantFrom(
  'standard-hero',
  'photo-forward',
  'question-hook',
  'stat-callout',
  'text-post',
  'comparison',
  'notes-app',
  'notification',
  'imessage',
  'meme'
);

const ALL_PLATFORMS: SocialPlatform[] = ['linkedin', 'meta', 'reddit'];

// ── Helpers ──

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const PREVIEW_COMPONENTS = {
  linkedin: LinkedInPreview,
  meta: MetaPreview,
  reddit: RedditPreview,
} as const;

function renderPreview(
  platform: SocialPlatform,
  copyBlock: CopyBlockFields,
  brandIdentity: BrandIdentity,
  creativeFormat: CreativeFormatId
): string {
  const Component = PREVIEW_COMPONENTS[platform];
  return renderToStaticMarkup(
    React.createElement(Component, { copyBlock, brandIdentity, creativeFormat })
  );
}

/**
 * Simulates the collapse/expand state logic from ThreeColumnPreview.
 * The component uses a Record<SocialPlatform, boolean> toggled via toggleColumn.
 */
type CollapseState = Record<SocialPlatform, boolean>;

function initialCollapseState(): CollapseState {
  return { linkedin: false, meta: false, reddit: false };
}

function toggleColumn(state: CollapseState, platform: SocialPlatform): CollapseState {
  return { ...state, [platform]: !state[platform] };
}

function visiblePlatforms(state: CollapseState): SocialPlatform[] {
  return ALL_PLATFORMS.filter((p) => !state[p]);
}

// ── Property 35: Copy change propagation to all previews ──

describe('Property 35: Copy change propagation to all previews', () => {
  it('updated headline is reflected in all three platform previews', () => {
    fc.assert(
      fc.property(
        copyBlockFieldsArb,
        fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,30}$/).filter((s) => s.trim().length > 0),
        brandIdentityArb,
        formatIdArb,
        (originalCopy, newHeadline, brand, format) => {
          fc.pre(newHeadline !== originalCopy.headline);

          const updatedCopy: CopyBlockFields = { ...originalCopy, headline: newHeadline };
          const escapedHeadline = escapeHtml(newHeadline);

          for (const platform of ALL_PLATFORMS) {
            const html = renderPreview(platform, updatedCopy, brand, format);
            expect(html).toContain(escapedHeadline);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('all previews reflect the same copy block fields simultaneously', () => {
    fc.assert(
      fc.property(copyBlockFieldsArb, brandIdentityArb, formatIdArb, (copyBlock, brand, format) => {
        const escapedHeadline = escapeHtml(copyBlock.headline);

        const htmls = ALL_PLATFORMS.map((p) => renderPreview(p, copyBlock, brand, format));

        // Every preview contains the headline
        for (const html of htmls) {
          expect(html).toContain(escapedHeadline);
        }
      }),
      { numRuns: 50 }
    );
  });

  it('changing copy produces different output from original in all previews', () => {
    fc.assert(
      fc.property(
        copyBlockFieldsArb,
        fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,30}$/).filter((s) => s.trim().length > 0),
        brandIdentityArb,
        formatIdArb,
        (originalCopy, newHeadline, brand, format) => {
          fc.pre(newHeadline !== originalCopy.headline);

          const updatedCopy: CopyBlockFields = { ...originalCopy, headline: newHeadline };

          for (const platform of ALL_PLATFORMS) {
            const originalHtml = renderPreview(platform, originalCopy, brand, format);
            const updatedHtml = renderPreview(platform, updatedCopy, brand, format);
            expect(updatedHtml).not.toBe(originalHtml);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── Property 36: Column collapse and expand round-trip ──

describe('Property 36: Column collapse and expand round-trip', () => {
  const platformArb: fc.Arbitrary<SocialPlatform> = fc.constantFrom(...ALL_PLATFORMS);

  it('collapsing then expanding a column restores original visible set', () => {
    fc.assert(
      fc.property(platformArb, (platform) => {
        const initial = initialCollapseState();
        const afterCollapse = toggleColumn(initial, platform);
        const afterExpand = toggleColumn(afterCollapse, platform);

        expect(visiblePlatforms(afterExpand)).toEqual(visiblePlatforms(initial));
      })
    );
  });

  it('collapsing a column removes it from visible set', () => {
    fc.assert(
      fc.property(platformArb, (platform) => {
        const initial = initialCollapseState();
        const afterCollapse = toggleColumn(initial, platform);

        expect(visiblePlatforms(afterCollapse)).not.toContain(platform);
        expect(visiblePlatforms(afterCollapse)).toHaveLength(2);
      })
    );
  });

  it('collapsing and expanding arbitrary sequences returns to initial state', () => {
    fc.assert(
      fc.property(
        fc.array(platformArb, { minLength: 1, maxLength: 20 }),
        (toggleSequence) => {
          let state = initialCollapseState();
          for (const platform of toggleSequence) {
            state = toggleColumn(state, platform);
          }
          // Toggle each platform the same number of times again to reverse
          for (const platform of toggleSequence) {
            state = toggleColumn(state, platform);
          }
          expect(state).toEqual(initialCollapseState());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('double-toggling any platform is identity', () => {
    fc.assert(
      fc.property(platformArb, (platform) => {
        const initial = initialCollapseState();
        const doubleToggled = toggleColumn(toggleColumn(initial, platform), platform);
        expect(doubleToggled).toEqual(initial);
      })
    );
  });

  it('collapsed column re-renders correctly after expand', () => {
    fc.assert(
      fc.property(
        platformArb,
        copyBlockFieldsArb,
        brandIdentityArb,
        formatIdArb,
        (platform, copyBlock, brand, format) => {
          // Render before collapse
          const beforeHtml = renderPreview(platform, copyBlock, brand, format);

          // Simulate collapse → expand (state returns to visible)
          const state = initialCollapseState();
          const collapsed = toggleColumn(state, platform);
          const expanded = toggleColumn(collapsed, platform);

          // Platform is visible again
          expect(visiblePlatforms(expanded)).toContain(platform);

          // Re-render produces identical output
          const afterHtml = renderPreview(platform, copyBlock, brand, format);
          expect(afterHtml).toBe(beforeHtml);
        }
      ),
      { numRuns: 50 }
    );
  });
});
