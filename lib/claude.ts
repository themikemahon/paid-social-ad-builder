import Anthropic from '@anthropic-ai/sdk';
import type {
  GenerationContext,
  CopyBlockFields,
  AdologyInsight,
  StrategyDocument,
  BrandIdentity,
  AudiencePersona,
  CreativeFormatId,
  SocialPlatform,
} from '@/lib/types';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Builds a prompt string from a GenerationContext, incorporating all
 * strategic intelligence, brand identity, persona, format constraints,
 * and target platform conventions.
 */
export function assemblePrompt(context: GenerationContext): string {
  const sections: string[] = [];

  // Target platform
  sections.push(formatPlatformSection(context.targetPlatform));

  // Creative format constraints
  sections.push(formatCreativeFormatSection(context.creativeFormat));

  // Brand identity voice guidelines
  sections.push(formatBrandIdentitySection(context.brandIdentity));

  // Adology insights
  if (context.adologyInsights.length > 0) {
    sections.push(formatAdologySection(context.adologyInsights));
  }

  // Strategy documents
  if (context.strategyDocuments.length > 0) {
    sections.push(formatStrategyDocsSection(context.strategyDocuments));
  }

  // Audience persona
  if (context.persona) {
    sections.push(formatPersonaSection(context.persona));
  }

  // Existing copy (for refinement)
  if (context.existingCopy) {
    sections.push(formatExistingCopySection(context.existingCopy));
  }

  // Output instructions
  sections.push(formatOutputInstructions());

  return sections.join('\n\n');
}

/**
 * System prompt encoding the creative director's writing voice and style rules.
 * Applied to every generation call so output matches the team's tone.
 */
const WRITING_VOICE_SYSTEM = `You are a senior copywriter working under an Executive Creative Director. Your writing must follow these rules exactly:

## Voice
- Clear, sharp, modern. Confident but not salesy.
- Strategic and context-aware: every line is part of a bigger system (brand, audience, channel, goal).
- Slight edge is welcome. Corny is not.
- Write like a human, not a marketing machine. If it sounds like a trailer voiceover, rewrite.

## Absolute Bans
- NEVER use "It's not just X, it's Y" or "Not only X, but also Y" or "This isn't about X. It is about Y." If contrast is needed, use: "X drives Y." or "X is the mechanism. Y is the payoff."
- NEVER use em dashes. Use commas, parentheses, a second sentence, or a colon instead.
- NEVER write fragment-heavy staccato copy ("Short. Choppy. Fragments."). Keep sentences complete and readable.
- NEVER use vague intensifiers: "game-changing," "seamless," "unlock," "elevate," "redefine," "journey," "transform," "leverage." Replace with concrete outcomes or mechanisms.

## Writing Rules
- Prefer varied sentence length, but keep sentences complete.
- Specificity over "ad speak." Every claim must map to a mechanism or feature.
- If you want punch, earn it with specificity, not fragmentation.
- No overpromising versus what the product can actually do.
- Optimize for work that ships, not work that sounds clever.

## Pre-Flight Check (run before returning output)
1. No contrast-cliché structures.
2. No em dashes.
3. No fragment-only sentences or staccato cadence.
4. No vague strategic filler.
5. All claims map to a mechanism or feature.
If any item fails, rewrite until it passes.`;

/**
 * Calls Claude API with the assembled prompt and parses the response
 * into structured CopyBlockFields.
 */
export async function generateCopy(context: GenerationContext): Promise<CopyBlockFields> {
  const client = getClient();
  const prompt = assemblePrompt(context);

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: WRITING_VOICE_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseClaudeResponse(message);
}

/**
 * Parses a Claude message response into CopyBlockFields.
 */
function parseClaudeResponse(message: Anthropic.Message): CopyBlockFields {
  const textBlock = message.content.find((block) => block.type === 'text');
  const text = textBlock && 'text' in textBlock ? textBlock.text : '';

  // Try JSON parse first
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

  // Fallback: line-based parsing
  return {
    headline: extractField(text, 'headline'),
    subhead: extractField(text, 'subhead'),
    primaryCta: extractField(text, 'primary_cta') || extractField(text, 'primaryCta'),
    secondaryCta: extractField(text, 'secondary_cta') || extractField(text, 'secondaryCta'),
  };
}

function extractField(text: string, field: string): string {
  const regex = new RegExp(`${field}\\s*[:=]\\s*["']?(.+?)["']?\\s*$`, 'im');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

// ============================================================
// Prompt section formatters
// ============================================================

function formatPlatformSection(platform: SocialPlatform): string {
  const conventions: Record<SocialPlatform, string> = {
    linkedin: [
      'Professional tone. B2B-oriented.',
      'STRICT CHARACTER LIMITS: headline max 125 chars, subhead max 300 chars, primaryCta (native) max 20 chars, secondaryCta (custom) max 25 chars.',
      'NATIVE CTA OPTIONS (primaryCta MUST be one of these exactly): "Apply Now", "Download", "Get Quote", "Learn More", "Sign Up", "Subscribe", "Register", "Join", "Attend", "Request Demo".',
      'secondaryCta is a custom CTA that appears on the image/graphic — keep it short and action-oriented.',
    ].join('\n'),
    meta: [
      'Conversational, scroll-stopping tone.',
      'STRICT CHARACTER LIMITS: headline max 125 chars, subhead max 300 chars, primaryCta (native) max 20 chars, secondaryCta (custom) max 25 chars.',
      'NATIVE CTA OPTIONS (primaryCta MUST be one of these exactly): "Apply Now", "Book Now", "Contact Us", "Download", "Get Offer", "Get Quote", "Learn More", "Listen Now", "Order Now", "Shop Now", "Sign Up", "Subscribe", "Watch More".',
      'secondaryCta is a custom CTA that appears on the image/graphic — keep it short and action-oriented.',
    ].join('\n'),
    reddit: [
      'Authentic, community-friendly tone. Avoid overly promotional language.',
      'STRICT CHARACTER LIMITS: headline max 125 chars, subhead max 300 chars, primaryCta (native) max 20 chars, secondaryCta (custom) max 25 chars.',
      'NATIVE CTA OPTIONS (primaryCta MUST be one of these exactly): "Learn More", "Sign Up", "Shop Now", "Install", "Download", "Get Started", "Contact Us", "Apply Now", "Play Now", "Watch Now".',
      'secondaryCta is a custom CTA that appears on the image/graphic — keep it short and action-oriented.',
    ].join('\n'),
  };

  return `## Target Platform: ${platform.toUpperCase()}\n${conventions[platform]}`;
}

function formatCreativeFormatSection(format: CreativeFormatId): string {
  const constraints: Record<CreativeFormatId, string> = {
    'standard-hero': 'Standard hero layout with prominent headline and supporting subhead.',
    'photo-forward': 'Image-first layout. Keep headline concise to complement the visual.',
    'question-hook': 'Lead with a compelling question as the headline to drive engagement.',
    'stat-callout': 'Headline should feature a striking statistic or data point.',
    'text-post': 'Text-only format. Copy must stand on its own without visual support.',
    'comparison': 'Before/after or versus framing. Headline should set up the contrast.',
    'notes-app': 'Casual, note-style format. Write as if jotting down a quick thought.',
    'notification': 'Mimic a push notification. Ultra-short headline, urgent tone.',
    'imessage': 'Conversational, message-bubble style. Keep it brief and personal.',
    'meme': 'Humorous, relatable tone. Headline is the setup, subhead is the punchline.',
  };

  return `## Creative Format: ${format}\n${constraints[format]}`;
}

function formatBrandIdentitySection(brand: BrandIdentity): string {
  const lines = [
    `## Brand Identity`,
    `Brand: ${brand.brandName}`,
    `Primary Color: ${brand.colorPrimary}`,
    `Secondary Color: ${brand.colorSecondary}`,
    `Accent Color: ${brand.colorAccent}`,
    `Font: ${brand.fontFamily}`,
  ];
  if (brand.logoUrl) {
    lines.push(`Logo: ${brand.logoUrl}`);
  }
  lines.push('Ensure copy aligns with this brand voice and visual identity.');
  return lines.join('\n');
}

function formatAdologySection(insights: AdologyInsight[]): string {
  const lines = ['## Strategic Intelligence (Adology)'];
  for (const insight of insights) {
    lines.push(`\n### ${insight.voice.charAt(0).toUpperCase() + insight.voice.slice(1)} Voice`);
    if (insight.gaps?.length) {
      lines.push(`Gaps: ${JSON.stringify(insight.gaps)}`);
    }
    if (insight.trends?.length) {
      lines.push(`Trends: ${JSON.stringify(insight.trends)}`);
    }
    if (insight.distributions?.length) {
      lines.push(`Distributions: ${JSON.stringify(insight.distributions)}`);
    }
    if (insight.comparisons?.length) {
      lines.push(`Comparisons: ${JSON.stringify(insight.comparisons)}`);
    }
  }
  return lines.join('\n');
}

function formatStrategyDocsSection(docs: StrategyDocument[]): string {
  const lines = ['## Strategy Documents'];
  for (const doc of docs) {
    const scope = doc.projectId ? 'Project' : 'Workspace';
    lines.push(`- [${scope}] ${doc.filename} (${doc.fileType})`);
  }
  lines.push('Use these documents as context for brand positioning and tone.');
  return lines.join('\n');
}

function formatPersonaSection(persona: AudiencePersona): string {
  const lines = [
    `## Target Audience Persona: ${persona.name}`,
    `Demographics: ${JSON.stringify(persona.demographics)}`,
    `Pain Points: ${persona.painPoints.join(', ')}`,
    `Motivations: ${persona.motivations.join(', ')}`,
    `Platform Behavior: ${JSON.stringify(persona.platformBehavior)}`,
    'Tailor the copy to resonate with this audience segment.',
  ];
  return lines.join('\n');
}

function formatExistingCopySection(copy: CopyBlockFields): string {
  return [
    '## Existing Copy (for reference/refinement)',
    `Headline: ${copy.headline}`,
    `Subhead: ${copy.subhead}`,
    `Primary CTA: ${copy.primaryCta}`,
    `Secondary CTA: ${copy.secondaryCta}`,
  ].join('\n');
}

function formatOutputInstructions(): string {
  return [
    '## Output Instructions',
    'Generate ad copy and return it as a JSON object with these exact fields:',
    '```json',
    '{',
    '  "headline": "Primary messaging (max 125 chars)",',
    '  "subhead": "Secondary messaging (max 300 chars)",',
    '  "primaryCta": "Must be an exact native CTA from the platform list above (max 20 chars)",',
    '  "secondaryCta": "Custom CTA for image/graphic (max 25 chars)"',
    '}',
    '```',
    'CRITICAL: primaryCta MUST be chosen from the native CTA options listed for the target platform. Do NOT invent custom text for primaryCta.',
    'CRITICAL: Respect ALL character limits strictly. Count characters carefully.',
    'Return ONLY the JSON object, no additional text.',
  ].join('\n');
}
