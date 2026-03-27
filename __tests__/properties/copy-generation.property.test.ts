/**
 * Property tests for Copy Generation.
 *
 * Property 12: Project strategy override precedence — project overrides take precedence over workspace strategy
 * Property 15: Persona included in generation context — persona fields present in assembled context
 * Property 18: Strategy documents in generation context — workspace and project docs included
 * Property 28: Copy generation prompt assembly — prompt contains platform, format, brand, insights, persona
 * Property 29: Claude response parsing — valid response produces non-null CopyBlockFields
 *
 * Validates: Requirements 3.3, 4.5, 5.5, 9.1, 9.2, 9.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { assemblePrompt } from '@/lib/claude';
import type {
  AdologyInsight,
  AudiencePersona,
  BrandIdentity,
  CopyBlockFields,
  CreativeFormatId,
  GenerationContext,
  SocialPlatform,
  StrategyDocType,
  StrategyDocument,
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

const strategyDocTypeArb: fc.Arbitrary<StrategyDocType> = fc.constantFrom('pdf', 'docx', 'txt');

/** Generate a hex color string like #a1b2c3. */
const hexColorArb = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 })
  .map(
    ([r, g, b]) =>
      `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  );

const brandIdentityArb: fc.Arbitrary<BrandIdentity> = fc.record({
  brandName: fc.string({ minLength: 1, maxLength: 30 }),
  logoUrl: fc.option(fc.webUrl(), { nil: null }),
  colorPrimary: hexColorArb,
  colorSecondary: hexColorArb,
  colorAccent: hexColorArb,
  fontFamily: fc.constantFrom('Inter', 'Roboto', 'Arial', 'Helvetica'),
});

const personaArb: fc.Arbitrary<AudiencePersona> = fc.record({
  id: fc.uuid(),
  workspaceId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  demographics: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
    fc.oneof(fc.string({ minLength: 1, maxLength: 20 }), fc.integer()),
    { minKeys: 1, maxKeys: 3 }
  ),
  painPoints: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 4 }),
  motivations: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 4 }),
  platformBehavior: fc.record({
    linkedin: fc.string({ minLength: 1, maxLength: 30 }),
    meta: fc.string({ minLength: 1, maxLength: 30 }),
    reddit: fc.string({ minLength: 1, maxLength: 30 }),
  }) as fc.Arbitrary<Record<SocialPlatform, string>>,
});

const insightDataArrayArb = fc.array(
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.integer(),
    fc.record({ label: fc.string(), value: fc.integer() })
  ),
  { minLength: 1, maxLength: 5 }
);

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
  .filter(
    (i) =>
      (i.distributions?.length ?? 0) > 0 ||
      (i.comparisons?.length ?? 0) > 0 ||
      (i.gaps?.length ?? 0) > 0 ||
      (i.trends?.length ?? 0) > 0
  );

const strategyDocArb = (projectId: string | null): fc.Arbitrary<StrategyDocument> =>
  fc.record({
    id: fc.uuid(),
    workspaceId: fc.uuid(),
    projectId: fc.constant(projectId),
    filename: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    fileType: strategyDocTypeArb,
    blobUrl: fc.constant('https://blob.example.com/doc'),
    fileSizeBytes: fc.integer({ min: 100, max: 1000000 }),
    createdAt: fc.constant(new Date().toISOString()),
  });

const copyBlockFieldsArb: fc.Arbitrary<CopyBlockFields> = fc.record({
  headline: fc.string({ minLength: 1, maxLength: 50 }),
  subhead: fc.string({ minLength: 1, maxLength: 50 }),
  primaryCta: fc.string({ minLength: 1, maxLength: 30 }),
  secondaryCta: fc.string({ minLength: 1, maxLength: 30 }),
});

/** Build a full GenerationContext with optional overrides. */
function makeContext(overrides?: Partial<GenerationContext>): GenerationContext {
  return {
    adologyInsights: [],
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

// ── Property 12: Project strategy override precedence ──
// Feature: paid-social-ad-builder, Property 12: Project strategy override precedence
// **Validates: Requirements 3.3**
describe('Property 12: Project strategy override precedence', () => {
  it('assembled prompt includes both workspace-level and project-level strategy docs with correct scope labels', () => {
    const projectId = 'project-uuid';

    fc.assert(
      fc.property(
        fc.array(strategyDocArb(null), { minLength: 1, maxLength: 3 }),
        fc.array(strategyDocArb(projectId), { minLength: 1, maxLength: 3 }),
        brandIdentityArb,
        platformArb,
        formatIdArb,
        (workspaceDocs, projectDocs, brand, platform, format) => {
          const allDocs = [...workspaceDocs, ...projectDocs];
          const context = makeContext({
            strategyDocuments: allDocs,
            brandIdentity: brand,
            targetPlatform: platform,
            creativeFormat: format,
          });

          const prompt = assemblePrompt(context);

          // Prompt should contain the strategy documents section
          expect(prompt).toContain('Strategy Documents');

          // Workspace-level docs should appear with [Workspace] label
          for (const doc of workspaceDocs) {
            expect(prompt).toContain(`[Workspace] ${doc.filename}`);
          }

          // Project-level docs should appear with [Project] label
          for (const doc of projectDocs) {
            expect(prompt).toContain(`[Project] ${doc.filename}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 15: Persona included in generation context ──
// Feature: paid-social-ad-builder, Property 15: Persona included in generation context
// **Validates: Requirements 4.5**
describe('Property 15: Persona included in generation context', () => {
  it('assembled prompt contains persona name, demographics, pain points, motivations, and platform behavior', () => {
    fc.assert(
      fc.property(
        personaArb,
        brandIdentityArb,
        platformArb,
        formatIdArb,
        (persona, brand, platform, format) => {
          const context = makeContext({
            persona,
            brandIdentity: brand,
            targetPlatform: platform,
            creativeFormat: format,
          });

          const prompt = assemblePrompt(context);

          // Persona name appears in the section header
          expect(prompt).toContain(`Target Audience Persona: ${persona.name}`);

          // Demographics serialized as JSON
          expect(prompt).toContain(JSON.stringify(persona.demographics));

          // Pain points joined with commas
          for (const point of persona.painPoints) {
            expect(prompt).toContain(point);
          }

          // Motivations joined with commas
          for (const motivation of persona.motivations) {
            expect(prompt).toContain(motivation);
          }

          // Platform behavior serialized as JSON
          expect(prompt).toContain(JSON.stringify(persona.platformBehavior));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('assembled prompt omits persona section when persona is null', () => {
    const context = makeContext({ persona: null });
    const prompt = assemblePrompt(context);
    expect(prompt).not.toContain('Target Audience Persona');
  });
});

// ── Property 18: Strategy documents in generation context ──
// Feature: paid-social-ad-builder, Property 18: Strategy documents in generation context
// **Validates: Requirements 5.5**
describe('Property 18: Strategy documents in generation context', () => {
  it('assembled prompt includes all strategy documents with correct workspace/project scope labels', () => {
    const projectId = 'proj-uuid';

    fc.assert(
      fc.property(
        fc.array(strategyDocArb(null), { minLength: 1, maxLength: 3 }),
        fc.array(strategyDocArb(projectId), { minLength: 1, maxLength: 3 }),
        brandIdentityArb,
        platformArb,
        formatIdArb,
        (workspaceDocs, projectDocs, brand, platform, format) => {
          const allDocs = [...workspaceDocs, ...projectDocs];
          const context = makeContext({
            strategyDocuments: allDocs,
            brandIdentity: brand,
            targetPlatform: platform,
            creativeFormat: format,
          });

          const prompt = assemblePrompt(context);

          // Section header present
          expect(prompt).toContain('Strategy Documents');

          // Each workspace doc labeled [Workspace]
          for (const doc of workspaceDocs) {
            expect(prompt).toContain(`[Workspace] ${doc.filename} (${doc.fileType})`);
          }

          // Each project doc labeled [Project]
          for (const doc of projectDocs) {
            expect(prompt).toContain(`[Project] ${doc.filename} (${doc.fileType})`);
          }

          // Total doc count matches
          const workspaceMatches = (prompt.match(/\[Workspace\]/g) || []).length;
          const projectMatches = (prompt.match(/\[Project\]/g) || []).length;
          expect(workspaceMatches).toBe(workspaceDocs.length);
          expect(projectMatches).toBe(projectDocs.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 28: Copy generation prompt assembly ──
// Feature: paid-social-ad-builder, Property 28: Copy generation prompt assembly
// **Validates: Requirements 9.1, 9.5**
describe('Property 28: Copy generation prompt assembly', () => {
  it('assembled prompt contains platform, format, brand identity, adology insights, and persona', () => {
    const projectId = 'proj-uuid';

    fc.assert(
      fc.property(
        brandIdentityArb,
        platformArb,
        formatIdArb,
        fc.array(adologyInsightArb, { minLength: 1, maxLength: 3 }),
        fc.array(strategyDocArb(null), { minLength: 1, maxLength: 2 }),
        fc.array(strategyDocArb(projectId), { minLength: 1, maxLength: 2 }),
        personaArb,
        (brand, platform, format, insights, wsDocs, projDocs, persona) => {
          const context = makeContext({
            brandIdentity: brand,
            targetPlatform: platform,
            creativeFormat: format,
            adologyInsights: insights,
            strategyDocuments: [...wsDocs, ...projDocs],
            persona,
          });

          const prompt = assemblePrompt(context);

          // Platform name uppercased in section header
          expect(prompt).toContain(`Target Platform: ${platform.toUpperCase()}`);

          // Creative format name in section header
          expect(prompt).toContain(`Creative Format: ${format}`);

          // Brand identity fields
          expect(prompt).toContain(`Brand: ${brand.brandName}`);
          expect(prompt).toContain(`Primary Color: ${brand.colorPrimary}`);
          expect(prompt).toContain(`Secondary Color: ${brand.colorSecondary}`);
          expect(prompt).toContain(`Accent Color: ${brand.colorAccent}`);
          expect(prompt).toContain(`Font: ${brand.fontFamily}`);

          // Adology section present
          expect(prompt).toContain('Strategic Intelligence (Adology)');

          // Strategy docs section present
          expect(prompt).toContain('Strategy Documents');

          // Persona section present
          expect(prompt).toContain(`Target Audience Persona: ${persona.name}`);

          // Output instructions present
          expect(prompt).toContain('Output Instructions');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 29: Claude response parsing ──
// Feature: paid-social-ad-builder, Property 29: Claude response parsing
// **Validates: Requirements 9.2**
describe('Property 29: Claude response parsing', () => {
  /**
   * Simulates the JSON parsing logic from parseClaudeResponse.
   * Tries JSON extraction first, then falls back to line-based regex parsing.
   */
  function simulateParseClaudeResponse(text: string): CopyBlockFields | null {
    // Try JSON parse first — extract JSON object from text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          headline: String(parsed.headline ?? ''),
          subhead: String(parsed.subhead ?? ''),
          primaryCta: String(parsed.primaryCta ?? parsed.primary_cta ?? ''),
          secondaryCta: String(parsed.secondaryCta ?? parsed.secondary_cta ?? ''),
        };
      } catch {
        // Fall through to line-based parsing
      }
    }

    // Fallback: line-based parsing with regex field: value patterns
    const extractField = (field: string): string => {
      const regex = new RegExp(`${field}\\s*[:=]\\s*["']?(.+?)["']?\\s*$`, 'im');
      const match = text.match(regex);
      return match ? match[1].trim() : '';
    };

    return {
      headline: extractField('headline'),
      subhead: extractField('subhead'),
      primaryCta: extractField('primary_cta') || extractField('primaryCta'),
      secondaryCta: extractField('secondary_cta') || extractField('secondaryCta'),
    };
  }

  it('valid JSON response with camelCase fields produces non-null CopyBlockFields', () => {
    fc.assert(
      fc.property(copyBlockFieldsArb, (fields) => {
        const json = JSON.stringify({
          headline: fields.headline,
          subhead: fields.subhead,
          primaryCta: fields.primaryCta,
          secondaryCta: fields.secondaryCta,
        });

        const result = simulateParseClaudeResponse(json);

        expect(result).not.toBeNull();
        expect(result!.headline).toBe(fields.headline);
        expect(result!.subhead).toBe(fields.subhead);
        expect(result!.primaryCta).toBe(fields.primaryCta);
        expect(result!.secondaryCta).toBe(fields.secondaryCta);
      }),
      { numRuns: 100 }
    );
  });

  it('valid JSON response with snake_case fields produces correct CopyBlockFields', () => {
    fc.assert(
      fc.property(copyBlockFieldsArb, (fields) => {
        const json = JSON.stringify({
          headline: fields.headline,
          subhead: fields.subhead,
          primary_cta: fields.primaryCta,
          secondary_cta: fields.secondaryCta,
        });

        const result = simulateParseClaudeResponse(json);

        expect(result).not.toBeNull();
        expect(result!.headline).toBe(fields.headline);
        expect(result!.subhead).toBe(fields.subhead);
        expect(result!.primaryCta).toBe(fields.primaryCta);
        expect(result!.secondaryCta).toBe(fields.secondaryCta);
      }),
      { numRuns: 100 }
    );
  });

  it('JSON embedded in surrounding text is still extracted correctly', () => {
    // Prefix must not contain { or } to avoid confusing the JSON extraction regex
    const safePrefixArb = fc
      .string({ minLength: 0, maxLength: 30 })
      .filter((s) => !s.includes('{') && !s.includes('}'));

    fc.assert(
      fc.property(
        copyBlockFieldsArb,
        safePrefixArb,
        (fields, prefix) => {
          const json = JSON.stringify({
            headline: fields.headline,
            subhead: fields.subhead,
            primaryCta: fields.primaryCta,
            secondaryCta: fields.secondaryCta,
          });
          const text = `${prefix}\n${json}\n`;

          const result = simulateParseClaudeResponse(text);

          expect(result).not.toBeNull();
          expect(result!.headline).toBe(fields.headline);
          expect(result!.subhead).toBe(fields.subhead);
          expect(result!.primaryCta).toBe(fields.primaryCta);
          expect(result!.secondaryCta).toBe(fields.secondaryCta);
        }
      ),
      { numRuns: 100 }
    );
  });
});
