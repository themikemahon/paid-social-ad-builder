import type { CopyBlockFields, CsvError, CsvImportResult } from '@/lib/types';

const CSV_COLUMNS = ['headline', 'subhead', 'primaryCta', 'secondaryCta'] as const;

const HEADER_ALIASES: Record<string, keyof CopyBlockFields> = {
  headline: 'headline',
  subhead: 'subhead',
  primarycta: 'primaryCta',
  primary_cta: 'primaryCta',
  'primary cta': 'primaryCta',
  secondarycta: 'secondaryCta',
  secondary_cta: 'secondaryCta',
  'secondary cta': 'secondaryCta',
};

/**
 * Splits a single CSV line into fields, respecting quoted values.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parses CSV content into CopyBlockFields, skipping rows with empty headlines.
 */
export function parseCsv(content: string): CsvImportResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) {
    return { blocks: [], errors: [], successCount: 0, errorCount: 0 };
  }

  // Parse header row and build column index mapping
  const headerFields = splitCsvLine(lines[0]);
  const columnMap = new Map<number, keyof CopyBlockFields>();

  for (let i = 0; i < headerFields.length; i++) {
    const normalized = headerFields[i].toLowerCase().trim();
    const mapped = HEADER_ALIASES[normalized];
    if (mapped) {
      columnMap.set(i, mapped);
    }
  }

  const blocks: CopyBlockFields[] = [];
  const errors: CsvError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-based, accounting for header
    const fields = splitCsvLine(lines[i]);

    const block: CopyBlockFields = {
      headline: '',
      subhead: '',
      primaryCta: '',
      secondaryCta: '',
    };

    for (const [colIdx, fieldName] of columnMap) {
      if (colIdx < fields.length) {
        block[fieldName] = fields[colIdx];
      }
    }

    if (!block.headline) {
      errors.push({
        row: rowNumber,
        column: 'headline',
        message: 'Missing required headline value',
      });
      continue;
    }

    blocks.push(block);
  }

  return {
    blocks,
    errors,
    successCount: blocks.length,
    errorCount: errors.length,
  };
}

/**
 * Exports CopyBlockFields array to a CSV string with a header row.
 */
export function exportCsv(blocks: CopyBlockFields[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = blocks.map((block) =>
    CSV_COLUMNS.map((col) => escapeCsvField(block[col])).join(',')
  );
  return [header, ...rows].join('\n');
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
