/**
 * Property tests for CSV import/export operations.
 *
 * Property 24: CSV round-trip — parse then export produces equivalent content
 * Property 25: CSV parsing field mapping — columns map to correct CopyBlockFields
 * Property 26: CSV missing headline skip — rows with empty headline excluded with error
 * Property 27: CSV import count invariant — success + error = total data rows
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseCsv, exportCsv } from '@/lib/csv-parser';

// ── Arbitraries ──

/** Generate a simple CSV-safe string (no commas, quotes, or newlines) for simpler round-trip. */
const simpleCsvValueArb = fc
  .string({ minLength: 1, maxLength: 60 })
  .map((s) => s.replace(/[,"\n\r]/g, '').trim())
  .filter((s) => s.length > 0);

/** Generate a non-empty headline value. */
const headlineArb = simpleCsvValueArb;

/** Generate an optional field value (can be empty). */
const optionalFieldArb = fc.oneof(fc.constant(''), simpleCsvValueArb);

/** Generate a valid CopyBlockFields-like row with a non-empty headline. */
const validRowArb = fc.record({
  headline: headlineArb,
  subhead: optionalFieldArb,
  primaryCta: optionalFieldArb,
  secondaryCta: optionalFieldArb,
});

/** Generate a row with an empty headline (should be skipped). */
const emptyHeadlineRowArb = fc.record({
  headline: fc.constant(''),
  subhead: optionalFieldArb,
  primaryCta: optionalFieldArb,
  secondaryCta: optionalFieldArb,
});

/** Build a CSV string from rows with the standard header. */
function buildCsv(rows: { headline: string; subhead: string; primaryCta: string; secondaryCta: string }[]): string {
  const header = 'headline,subhead,primaryCta,secondaryCta';
  const dataRows = rows.map(
    (r) => `${r.headline},${r.subhead},${r.primaryCta},${r.secondaryCta}`
  );
  return [header, ...dataRows].join('\n');
}

// ── Property 24: CSV round-trip ──
// **Validates: Requirements 8.5**
describe('Property 24: CSV round-trip', () => {
  it('parsing a CSV then exporting produces equivalent content', () => {
    fc.assert(
      fc.property(
        fc.array(validRowArb, { minLength: 1, maxLength: 20 }),
        (rows) => {
          const csv = buildCsv(rows);
          const parsed = parseCsv(csv);

          // All rows have non-empty headlines so all should parse successfully
          expect(parsed.blocks).toHaveLength(rows.length);
          expect(parsed.errors).toHaveLength(0);

          // Export the parsed blocks back to CSV
          const exported = exportCsv(parsed.blocks);

          // Re-parse the exported CSV
          const reParsed = parseCsv(exported);

          // Round-trip: re-parsed blocks should match original parsed blocks
          expect(reParsed.blocks).toHaveLength(parsed.blocks.length);
          for (let i = 0; i < parsed.blocks.length; i++) {
            expect(reParsed.blocks[i].headline).toBe(parsed.blocks[i].headline);
            expect(reParsed.blocks[i].subhead).toBe(parsed.blocks[i].subhead);
            expect(reParsed.blocks[i].primaryCta).toBe(parsed.blocks[i].primaryCta);
            expect(reParsed.blocks[i].secondaryCta).toBe(parsed.blocks[i].secondaryCta);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 25: CSV parsing field mapping ──
// **Validates: Requirements 8.1, 8.2**
describe('Property 25: CSV parsing field mapping', () => {
  it('columns map to correct CopyBlockFields', () => {
    fc.assert(
      fc.property(validRowArb, (row) => {
        const csv = buildCsv([row]);
        const result = parseCsv(csv);

        expect(result.blocks).toHaveLength(1);

        const block = result.blocks[0];
        expect(block.headline).toBe(row.headline);
        expect(block.subhead).toBe(row.subhead);
        expect(block.primaryCta).toBe(row.primaryCta);
        expect(block.secondaryCta).toBe(row.secondaryCta);
      }),
      { numRuns: 100 }
    );
  });

  it('supports alternative header aliases (primary_cta, secondary_cta)', () => {
    fc.assert(
      fc.property(validRowArb, (row) => {
        const header = 'headline,subhead,primary_cta,secondary_cta';
        const dataRow = `${row.headline},${row.subhead},${row.primaryCta},${row.secondaryCta}`;
        const csv = [header, dataRow].join('\n');

        const result = parseCsv(csv);

        expect(result.blocks).toHaveLength(1);
        expect(result.blocks[0].headline).toBe(row.headline);
        expect(result.blocks[0].subhead).toBe(row.subhead);
        expect(result.blocks[0].primaryCta).toBe(row.primaryCta);
        expect(result.blocks[0].secondaryCta).toBe(row.secondaryCta);
      }),
      { numRuns: 50 }
    );
  });
});

// ── Property 26: CSV missing headline skip ──
// **Validates: Requirements 8.3**
describe('Property 26: CSV missing headline skip', () => {
  it('rows with empty headline are excluded from blocks and included in errors', () => {
    fc.assert(
      fc.property(
        fc.array(emptyHeadlineRowArb, { minLength: 1, maxLength: 10 }),
        (emptyRows) => {
          const csv = buildCsv(emptyRows);
          const result = parseCsv(csv);

          // No blocks should be produced — all headlines are empty
          expect(result.blocks).toHaveLength(0);

          // Each empty-headline row should produce an error
          expect(result.errors).toHaveLength(emptyRows.length);

          for (const error of result.errors) {
            expect(error.column).toBe('headline');
            expect(error.message).toContain('headline');
            // Row numbers should be >= 2 (1-based, after header)
            expect(error.row).toBeGreaterThanOrEqual(2);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('mixed rows: valid rows parsed, empty-headline rows skipped with errors', () => {
    fc.assert(
      fc.property(
        fc.array(validRowArb, { minLength: 1, maxLength: 5 }),
        fc.array(emptyHeadlineRowArb, { minLength: 1, maxLength: 5 }),
        (validRows, emptyRows) => {
          // Interleave valid and empty rows
          const allRows = [...validRows, ...emptyRows];
          const csv = buildCsv(allRows);
          const result = parseCsv(csv);

          expect(result.blocks).toHaveLength(validRows.length);
          expect(result.errors).toHaveLength(emptyRows.length);

          // Verify valid rows were parsed correctly (they come first)
          for (let i = 0; i < validRows.length; i++) {
            expect(result.blocks[i].headline).toBe(validRows[i].headline);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── Property 27: CSV import count invariant ──
// **Validates: Requirements 8.4**
describe('Property 27: CSV import count invariant', () => {
  it('successCount + errorCount equals total data rows', () => {
    fc.assert(
      fc.property(
        fc.array(validRowArb, { minLength: 0, maxLength: 10 }),
        fc.array(emptyHeadlineRowArb, { minLength: 0, maxLength: 10 }),
        (validRows, emptyRows) => {
          const allRows = [...validRows, ...emptyRows];
          const csv = buildCsv(allRows);
          const result = parseCsv(csv);

          const totalDataRows = allRows.length;

          // Invariant: success + error = total data rows
          expect(result.successCount + result.errorCount).toBe(totalDataRows);

          // Also verify the counts match the actual arrays
          expect(result.successCount).toBe(result.blocks.length);
          expect(result.errorCount).toBe(result.errors.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty CSV (header only) produces zero counts', () => {
    const csv = 'headline,subhead,primaryCta,secondaryCta';
    const result = parseCsv(csv);

    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.blocks).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('completely empty input produces zero counts', () => {
    const result = parseCsv('');

    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.blocks).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
