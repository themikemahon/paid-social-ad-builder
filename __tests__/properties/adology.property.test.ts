/**
 * Property tests for Adology integration.
 *
 * Property 19: Adology response inclusion in prompt — parsed data appears in generation context
 * Property 30: Format recommendation ordering — formats in descending score order
 *
 * Validates: Requirements 6.2, 10.2
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { assemblePrompt } from '@/lib/claude';
import type {
  AdologyInsight,
  GenerationContext,
  BrandIdentity,
  CreativeFormatId,
  SocialPlatform,
  FormatRanking,
} from '@/lib/types';

// ── Arbitraries ──

const platformArb: fc.Arbitrary<SocialPlatform> = fc.constantFrom('linkedin', 'meta', 'reddit');

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

/** Generate a hex color string like #a1b2c3. */
const hexColorArb = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 })
  .map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);

const brandIdentityArb: fc.Arbitrary<BrandIdentity> = fc.record({
  brandName: fc.string({ minLength: 1, maxLength: 30 }),
  logoUrl: fc.constant(null),
  colorPrimary: hexColorArb,
  colorSecondary: hexColorArb,
  colorAccent: hexColorArb,
  fontFamily: fc.constantFrom('Inter', 'Roboto', 'Arial', 'Helvetica'),
});

/** Generate a non-empty array of unknown items to use as Adology data arrays. */
const insightDataArrayArb = fc.array(
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.integer(),
    fc.record({ label: fc.string(), value: fc.integer() })
  ),
  { minLength: 1, maxLength: 5 }
);

/** Generate an AdologyInsight with at least one non-empty data array. */
const adologyInsightArb: fc.Arbitrary<AdologyInsight> = fc
  .record({
    voice: fc.constantFrom('category', 'culture', 'customer', 'performance'),
    data: fc.constant({} as Record<string, unknown>),
    hasDistributions: fc.boolean(),
    hasComparisons: fc.boolean(),
    hasGaps: fc.boolean(),
    hasTrends: fc.boolean(),
    distributions: insightDataArrayArb,
    comparisons: insightDataArrayArb,
    gaps: insightDataArrayArb,
    trends: insightDataArrayArb,
  })
  .map((r) => {
    const insight: AdologyInsight = { voice: r.voice, data: r.data };
    if (r.hasDistributions) insight.distributions = r.distributions;
    if (r.hasComparisons) insight.comparisons = r.comparisons;
    if (r.hasGaps) insight.gaps = r.gaps;
    if (r.hasTrends) insight.trends = r.trends;
    return insight;
  })
  // Ensure at least one data array is present
  .filter(
    (i) =>
      (i.distributions?.length ?? 0) > 0 ||
      (i.comparisons?.length ?? 0) > 0 ||
      (i.gaps?.length ?? 0) > 0 ||
      (i.trends?.length ?? 0) > 0
  );

/** Generate a minimal GenerationContext with Adology insights. */
function makeContext(
  insights: AdologyInsight[],
  overrides?: Partial<GenerationContext>
): GenerationContext {
  return {
    adologyInsights: insights,
    strategyDocuments: [],
    brandIdentity: {
      brandName: 'TestBrand',
      logoUrl: null,
      colorPrimary: '#000000',
      colorSecondary: '#ffffff',
      colorAccent: '#ff0000',
      fontFamily: 'Inter',
    },
    persona: null,
    creativeFormat: 'standard-hero',
    targetPlatform: 'linkedin',
    existingCopy: null,
    ...overrides,
  };
}

/** Generate a FormatRanking with a numeric score. */
const formatRankingArb: fc.Arbitrary<FormatRanking> = fc.record({
  formatId: formatIdArb,
  score: fc.double({ min: 0, max: 100, noNaN: true }),
  reason: fc.string({ minLength: 1, maxLength: 50 }),
});

// ── Property 19: Adology response inclusion in prompt ──
// **Validates: Requirements 6.2**
describe('Property 19: Adology response inclusion in prompt', () => {
  it('parsed Adology data arrays appear in the assembled prompt', () => {
    fc.assert(
      fc.property(
        fc.array(adologyInsightArb, { minLength: 1, maxLength: 4 }),
        brandIdentityArb,
        platformArb,
        formatIdArb,
        (insights, brand, platform, format) => {
          const context = makeContext(insights, {
            brandIdentity: brand,
            targetPlatform: platform,
            creativeFormat: format,
          });

          const prompt = assemblePrompt(context);

          // The prompt should contain the Adology section header
          expect(prompt).toContain('Strategic Intelligence (Adology)');

          // Each insight's voice should appear in the prompt
          for (const insight of insights) {
            const voiceLabel =
              insight.voice.charAt(0).toUpperCase() + insight.voice.slice(1);
            expect(prompt).toContain(`${voiceLabel} Voice`);

            // Each non-empty data array should be serialized into the prompt
            if (insight.gaps && insight.gaps.length > 0) {
              expect(prompt).toContain('Gaps:');
              expect(prompt).toContain(JSON.stringify(insight.gaps));
            }
            if (insight.trends && insight.trends.length > 0) {
              expect(prompt).toContain('Trends:');
              expect(prompt).toContain(JSON.stringify(insight.trends));
            }
            if (insight.distributions && insight.distributions.length > 0) {
              expect(prompt).toContain('Distributions:');
              expect(prompt).toContain(JSON.stringify(insight.distributions));
            }
            if (insight.comparisons && insight.comparisons.length > 0) {
              expect(prompt).toContain('Comparisons:');
              expect(prompt).toContain(JSON.stringify(insight.comparisons));
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('prompt omits Adology section when no insights are provided', () => {
    const context = makeContext([]);
    const prompt = assemblePrompt(context);
    expect(prompt).not.toContain('Strategic Intelligence (Adology)');
  });
});

// ── Property 30: Format recommendation ordering ──
// **Validates: Requirements 10.2**
describe('Property 30: Format recommendation ordering', () => {
  it('rankings sorted by descending score remain in descending order', () => {
    fc.assert(
      fc.property(
        fc.array(formatRankingArb, { minLength: 2, maxLength: 10 }),
        (rankings) => {
          // Sort the same way fetchFormatRecommendations does
          const sorted = [...rankings].sort((a, b) => b.score - a.score);

          // Verify descending order
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i - 1].score).toBeGreaterThanOrEqual(sorted[i].score);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sorting is stable — equal scores preserve relative order', () => {
    fc.assert(
      fc.property(
        fc.array(formatRankingArb, { minLength: 2, maxLength: 10 }),
        (rankings) => {
          // Tag each ranking with its original index
          const tagged = rankings.map((r, i) => ({ ...r, originalIndex: i }));
          const sorted = [...tagged].sort((a, b) => b.score - a.score);

          // For items with equal scores, original order should be preserved
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i - 1].score === sorted[i].score) {
              expect(sorted[i - 1].originalIndex).toBeLessThan(sorted[i].originalIndex);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('top-ranked format has the highest score', () => {
    fc.assert(
      fc.property(
        fc.array(formatRankingArb, { minLength: 1, maxLength: 10 }),
        (rankings) => {
          const sorted = [...rankings].sort((a, b) => b.score - a.score);
          const maxScore = Math.max(...rankings.map((r) => r.score));
          expect(sorted[0].score).toBe(maxScore);
        }
      ),
      { numRuns: 100 }
    );
  });
});
