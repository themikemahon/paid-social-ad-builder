import type { AdologyInsight, AudiencePersona, CreativeFormatId, FormatRanking } from '@/lib/types';

const ADOLOGY_BASE_URL = process.env.ADOLOGY_API_URL || 'https://api.adology.com/v2.2';
const ADOLOGY_API_KEY = process.env.ADOLOGY_API_KEY || '';

interface AdologyRequestOptions {
  brandId: string;
  customLabels?: Record<string, string>;
  platforms?: string[];
}

async function adologyFetch(path: string, params: Record<string, string> = {}): Promise<unknown | null> {
  try {
    const url = new URL(`${ADOLOGY_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${ADOLOGY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`Adology API error: ${res.status} ${res.statusText} for ${path}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`Adology API request failed for ${path}:`, err);
    return null;
  }
}

/**
 * Fetch Category Voice intelligence from Adology Tier 2.
 * Returns parsed insight or null on failure.
 */
export async function fetchCategoryVoice(
  options: AdologyRequestOptions
): Promise<AdologyInsight | null> {
  try {
    const params: Record<string, string> = { brand_id: options.brandId };
    if (options.platforms?.length) {
      params.platforms = options.platforms.join(',');
    }
    if (options.customLabels && Object.keys(options.customLabels).length > 0) {
      params.custom_labels = JSON.stringify(options.customLabels);
    }

    const data = await adologyFetch('/intelligence/category-voice', params);
    if (!data || typeof data !== 'object') return null;

    return parseInsight('category', data as Record<string, unknown>);
  } catch (err) {
    console.error('fetchCategoryVoice failed:', err);
    return null;
  }
}

/**
 * Fetch Culture Voice intelligence from Adology Tier 2.
 * Returns parsed insight or null on failure.
 */
export async function fetchCultureVoice(
  options: AdologyRequestOptions
): Promise<AdologyInsight | null> {
  try {
    const params: Record<string, string> = { brand_id: options.brandId };
    if (options.platforms?.length) {
      params.platforms = options.platforms.join(',');
    }
    if (options.customLabels && Object.keys(options.customLabels).length > 0) {
      params.custom_labels = JSON.stringify(options.customLabels);
    }

    const data = await adologyFetch('/intelligence/culture-voice', params);
    if (!data || typeof data !== 'object') return null;

    return parseInsight('culture', data as Record<string, unknown>);
  } catch (err) {
    console.error('fetchCultureVoice failed:', err);
    return null;
  }
}

/**
 * Fetch format recommendations from Adology based on campaign objective and persona.
 * Returns ranked list or null on failure.
 */
export async function fetchFormatRecommendations(
  objective: string,
  persona: AudiencePersona | null,
  brandId: string
): Promise<FormatRanking[] | null> {
  try {
    const params: Record<string, string> = {
      brand_id: brandId,
      objective,
    };
    if (persona) {
      params.persona_name = persona.name;
      if (persona.demographics && Object.keys(persona.demographics).length > 0) {
        params.demographics = JSON.stringify(persona.demographics);
      }
    }

    const data = await adologyFetch('/formats/recommendations', params);
    if (!data || !Array.isArray(data)) return null;

    return (data as Array<Record<string, unknown>>)
      .map((item) => ({
        formatId: item.format_id as CreativeFormatId,
        score: typeof item.score === 'number' ? item.score : 0,
        reason: typeof item.reason === 'string' ? item.reason : '',
      }))
      .sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error('fetchFormatRecommendations failed:', err);
    return null;
  }
}

/**
 * Stub: Fetch Customer Voice intelligence (future Adology endpoint).
 * Returns null until the endpoint is available.
 */
export async function fetchCustomerVoice(
  options: AdologyRequestOptions
): Promise<AdologyInsight | null> {
  // Future endpoint — not yet available in Adology API v2.2
  console.info(`fetchCustomerVoice stub called for brand ${options.brandId}`);
  return null;
}

/**
 * Stub: Fetch Performance Voice intelligence (future Adology endpoint).
 * Returns null until the endpoint is available.
 */
export async function fetchPerformanceVoice(
  options: AdologyRequestOptions
): Promise<AdologyInsight | null> {
  // Future endpoint — not yet available in Adology API v2.2
  console.info(`fetchPerformanceVoice stub called for brand ${options.brandId}`);
  return null;
}

function parseInsight(voice: string, data: Record<string, unknown>): AdologyInsight {
  return {
    voice,
    data,
    distributions: Array.isArray(data.distributions) ? data.distributions : undefined,
    comparisons: Array.isArray(data.comparisons) ? data.comparisons : undefined,
    gaps: Array.isArray(data.gaps) ? data.gaps : undefined,
    trends: Array.isArray(data.trends) ? data.trends : undefined,
  };
}
