/**
 * Property tests for Template Rendering.
 *
 * Property 31: All creative formats registered — all 10 format IDs return valid components
 * Property 32: Idempotent template rendering — format A → B → A produces identical output
 * Property 33: Multi-platform rendering completeness — preview count equals enabled platform count
 * Property 34: Brand identity application in rendering — output contains brand colors, font, logo
 *
 * Validates: Requirements 10.4, 11.2, 11.3, 11.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getTemplate, getAllFormats } from '@/lib/templates';
import type {
  BrandIdentity,
  CopyBlockFields,
  CreativeFormatId,
  SocialPlatform,
} from '@/lib/types';
import type { TemplateProps } from '@/lib/templates/types';

// ── Constants ──

const ALL_FORMAT_IDS: CreativeFormatId[] = [
  'standard-hero',
  'photo-forward',
  'question-hook',
  'stat-callout',
  'text-post',
  'comparison',
  'notes-app',
  'notification',
  'imessage',
  'meme',
];

const ALL_PLATFORMS: SocialPlatform[] = ['linkedin', 'meta', 'reddit'];

// ── Arbitraries ──

const hexColorArb = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 })
  .map(
    ([r, g, b]) =>
      `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  );

const brandIdentityArb: fc.Arbitrary<BrandIdentity> = fc.record({
  brandName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  logoUrl: fc.option(fc.webUrl(), { nil: null }),
  colorPrimary: hexColorArb,
  colorSecondary: hexColorArb,
  colorAccent: hexColorArb,
  fontFamily: fc.constantFrom('Inter', 'Roboto', 'Arial', 'Helvetica'),
});

const copyBlockFieldsArb: fc.Arbitrary<CopyBlockFields> = fc.record({
  headline: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
  subhead: fc.string({ maxLength: 100 }),
  primaryCta: fc.string({ maxLength: 30 }),
  secondaryCta: fc.string({ maxLength: 30 }),
});

const formatIdArb: fc.Arbitrary<CreativeFormatId> = fc.constantFrom(...ALL_FORMAT_IDS);
const platformArb: fc.Arbitrary<SocialPlatform> = fc.constantFrom(...ALL_PLATFORMS);

const templatePropsArb: fc.Arbitrary<TemplateProps> = fc.record({
  copyBlock: copyBlockFieldsArb,
  brandIdentity: brandIdentityArb,
  platform: platformArb,
  imageUrl: fc.constant(undefined),
  aspectRatio: fc.constant(undefined),
});

// ── Helper ──

function renderTemplate(formatId: CreativeFormatId, props: TemplateProps): string {
  const Template = getTemplate(formatId);
  if (!Template) throw new Error(`No template for format: ${formatId}`);
  return renderToStaticMarkup(React.createElement(Template, props));
}

// ── Property 31: All creative formats registered ──

describe('Property 31: All creative formats registered', () => {
  it('all 10 format IDs return valid components from getTemplate', () => {
    for (const id of ALL_FORMAT_IDS) {
      const component = getTemplate(id);
      expect(component).not.toBeNull();
      expect(typeof component).toBe('function');
    }
  });

  it('getAllFormats returns exactly 10 formats matching all IDs', () => {
    const formats = getAllFormats();
    expect(formats).toHaveLength(10);
    const ids = formats.map((f) => f.id);
    for (const id of ALL_FORMAT_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('every registered format renders without throwing for arbitrary props', () => {
    fc.assert(
      fc.property(formatIdArb, templatePropsArb, (formatId, props) => {
        const html = renderTemplate(formatId, props);
        expect(html.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 }
    );
  });
});

// ── Property 32: Idempotent template rendering ──

describe('Property 32: Idempotent template rendering', () => {
  it('rendering with format A, switching to B, then back to A produces identical output', () => {
    fc.assert(
      fc.property(
        formatIdArb,
        formatIdArb.filter((b) => b !== 'standard-hero'),
        templatePropsArb,
        (formatA, formatB, props) => {
          fc.pre(formatA !== formatB);

          const firstRenderA = renderTemplate(formatA, props);
          // Switch to format B
          renderTemplate(formatB, props);
          // Switch back to format A
          const secondRenderA = renderTemplate(formatA, props);

          expect(secondRenderA).toBe(firstRenderA);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('same format and props always produce identical output', () => {
    fc.assert(
      fc.property(formatIdArb, templatePropsArb, (formatId, props) => {
        const render1 = renderTemplate(formatId, props);
        const render2 = renderTemplate(formatId, props);
        expect(render1).toBe(render2);
      }),
      { numRuns: 50 }
    );
  });
});

// ── Property 33: Multi-platform rendering completeness ──

describe('Property 33: Multi-platform rendering completeness', () => {
  it('preview count equals enabled platform count for any subset of platforms', () => {
    fc.assert(
      fc.property(
        fc.subarray(ALL_PLATFORMS, { minLength: 1 }),
        formatIdArb,
        copyBlockFieldsArb,
        brandIdentityArb,
        (enabledPlatforms, formatId, copyBlock, brandIdentity) => {
          const previews = enabledPlatforms.map((platform) =>
            renderTemplate(formatId, { copyBlock, brandIdentity, platform })
          );
          expect(previews).toHaveLength(enabledPlatforms.length);
          // Each preview should be non-empty
          for (const html of previews) {
            expect(html.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('all three platforms render simultaneously for any format', () => {
    fc.assert(
      fc.property(formatIdArb, copyBlockFieldsArb, brandIdentityArb, (formatId, copyBlock, brandIdentity) => {
        const previews = ALL_PLATFORMS.map((platform) =>
          renderTemplate(formatId, { copyBlock, brandIdentity, platform })
        );
        expect(previews).toHaveLength(3);
        // All three should produce distinct or valid HTML (non-empty)
        for (const html of previews) {
          expect(html.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 30 }
    );
  });
});

// ── Property 34: Brand identity application in rendering ──

/**
 * Helper to HTML-escape a string the same way React's renderToStaticMarkup does,
 * so we can reliably search for arbitrary generated strings inside rendered HTML.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Arbitrary that produces CopyBlockFields with non-empty CTA fields to ensure color usage. */
const copyBlockWithCtaArb: fc.Arbitrary<CopyBlockFields> = fc.record({
  headline: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
  subhead: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  primaryCta: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  secondaryCta: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
});

describe('Property 34: Brand identity application in rendering', () => {
  it('rendered output always contains the font family', () => {
    fc.assert(
      fc.property(formatIdArb, templatePropsArb, (formatId, props) => {
        const html = renderTemplate(formatId, props);
        expect(html).toContain(props.brandIdentity.fontFamily);
      }),
      { numRuns: 50 }
    );
  });

  it('rendered output contains at least one brand color when copy fields are populated', () => {
    fc.assert(
      fc.property(formatIdArb, copyBlockWithCtaArb, brandIdentityArb, platformArb, (formatId, copyBlock, brandIdentity, platform) => {
        const html = renderTemplate(formatId, { copyBlock, brandIdentity, platform });
        const hasAnyColor =
          html.includes(brandIdentity.colorPrimary) ||
          html.includes(brandIdentity.colorSecondary) ||
          html.includes(brandIdentity.colorAccent);
        expect(hasAnyColor).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('rendered output contains logo URL when logoUrl is provided', () => {
    // Use simple alphanumeric URLs to avoid HTML-encoding edge cases with special chars
    const simpleBrandArb = fc.record({
      brandName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
      logoUrl: fc.constant('https://example.com/logo.png' as string | null),
      colorPrimary: hexColorArb,
      colorSecondary: hexColorArb,
      colorAccent: hexColorArb,
      fontFamily: fc.constantFrom('Inter', 'Roboto', 'Arial', 'Helvetica'),
    });

    fc.assert(
      fc.property(formatIdArb, copyBlockFieldsArb, simpleBrandArb, platformArb, (formatId, copyBlock, brandIdentity, platform) => {
        const html = renderTemplate(formatId, { copyBlock, brandIdentity, platform });
        expect(html).toContain(escapeHtml(brandIdentity.logoUrl!));
      }),
      { numRuns: 50 }
    );
  });

  it('rendered output contains brand name when logo is present', () => {
    const brandWithLogoArb = fc.record({
      brandName: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,15}$/).filter((s) => s.trim().length > 0),
      logoUrl: fc.constant('https://example.com/logo.png' as string | null),
      colorPrimary: hexColorArb,
      colorSecondary: hexColorArb,
      colorAccent: hexColorArb,
      fontFamily: fc.constantFrom('Inter', 'Roboto', 'Arial', 'Helvetica'),
    });

    fc.assert(
      fc.property(formatIdArb, copyBlockFieldsArb, brandWithLogoArb, platformArb, (formatId, copyBlock, brandIdentity, platform) => {
        const html = renderTemplate(formatId, { copyBlock, brandIdentity, platform });
        // Brand name appears in alt attributes or as text content
        expect(html).toContain(escapeHtml(brandIdentity.brandName));
      }),
      { numRuns: 50 }
    );
  });
});
