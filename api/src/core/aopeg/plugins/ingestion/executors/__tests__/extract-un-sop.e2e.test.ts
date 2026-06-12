/**
 * E2E tests for ExtractUNSOPExecutor
 *
 * Tests against a representative text fixture of the
 * Information Security Policy Directive (UN Secretariat, 2013).
 * The fixture captures the structural patterns of real UN regulatory documents:
 *   - Section numbering (Section N / Annex A)
 *   - Obligation statements (shall, must, is responsible for)
 *   - Role assignments (CIO, Focal Points, staff members)
 *   - Cross-references (ST/SGB, ST/AI, ISO standards)
 */

import * as fs from 'fs';
import * as path from 'path';

import { ExtractUNSOPExecutor } from '../extract-un-sop.executor';

// ────────────────────────────────────────────────────────────────────────────
// FIXTURE
// ────────────────────────────────────────────────────────────────────────────

// From __tests__: ../../../../../../.. = api/
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../../../../../test-data/un-sop-samples/information-security-policy-directive-2013.txt'
);

function loadFixture(): string {
  if (fs.existsSync(FIXTURE_PATH)) {
    return fs.readFileSync(FIXTURE_PATH, 'utf-8');
  }
  throw new Error(`Test fixture not found: ${FIXTURE_PATH}`);
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function makeContext(vars: Record<string, unknown> = {}): any {
  return { variables: vars, nodeId: 'test-node', graphId: 'test-graph' };
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────────────────

describe('ExtractUNSOPExecutor — E2E on Information Security Policy Directive 2013', () => {
  let executor: ExtractUNSOPExecutor;
  let text: string;
  let result: any;

  beforeAll(async () => {
    executor = new ExtractUNSOPExecutor();
    text = loadFixture();
    result = await executor.execute({ text }, makeContext());
  });

  // ── basic success ──────────────────────────────────────────────────────────

  test('executor succeeds without error', () => {
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('output contains document, sections, roles, crossReferences, stats', () => {
    const { document, sections, roles, crossReferences, stats } = result.output;
    expect(document).toBeDefined();
    expect(Array.isArray(sections)).toBe(true);
    expect(Array.isArray(roles)).toBe(true);
    expect(Array.isArray(crossReferences)).toBe(true);
    expect(stats).toBeDefined();
  });

  // ── document metadata ──────────────────────────────────────────────────────

  test('issuingBody is SECRETARIAT (detected from ST/SGB reference)', () => {
    // Document itself has no ST/* symbol, but references ST/SGB/2007/6 and ST/AI/2002/5
    // — fixture references ST/SGB/2007/6 which triggers SECRETARIAT detection
    expect(result.output.document.issuingBody).toBe('SECRETARIAT');
  });

  test('effectiveDate is 2013-03-07', () => {
    expect(result.output.document.effectiveDate).toBe('2013-03-07');
  });

  test('legalBasis captures Article 97 or Charter reference', () => {
    const basis: string = result.output.document.legalBasis || '';
    expect(basis.length).toBeGreaterThan(0);
    const hasBasis = basis.includes('97') || basis.includes('Charter') || basis.includes('Article');
    expect(hasBasis).toBe(true);
  });

  // ── sections ──────────────────────────────────────────────────────────────

  test('extracts at least 6 sections', () => {
    expect(result.output.sections.length).toBeGreaterThanOrEqual(6);
  });

  test('sections include Section 1, Section 5, Annex A', () => {
    const sectionNumbers = result.output.sections.map((s: any) => s.sectionNumber);
    const has1 = sectionNumbers.some((n: string) => n.includes('1') || n.includes('Section 1'));
    const has5 = sectionNumbers.some((n: string) => n.includes('5') || n.includes('Section 5'));
    const hasAnnex = sectionNumbers.some((n: string) => n.toLowerCase().includes('annex') || n.includes('A'));
    expect(has1).toBe(true);
    expect(has5).toBe(true);
    expect(hasAnnex).toBe(true);
  });

  // ── obligations ───────────────────────────────────────────────────────────

  test('total obligations extracted > 0', () => {
    expect(result.output.stats.obligationsFound).toBeGreaterThan(0);
  });

  test('obligations include SHALL and MUST modalities', () => {
    const allObligations = result.output.sections.flatMap((s: any) => s.obligations);
    const modalities = allObligations.map((o: any) => o.modality);
    expect(modalities).toContain('SHALL');
    expect(modalities).toContain('MUST');
  });

  test('IS_RESPONSIBLE_FOR obligations are present', () => {
    const allObligations = result.output.sections.flatMap((s: any) => s.obligations);
    const hasResponsible = allObligations.some((o: any) => o.modality === 'IS_RESPONSIBLE_FOR');
    expect(hasResponsible).toBe(true);
  });

  // ── roles ─────────────────────────────────────────────────────────────────

  test('roles are extracted', () => {
    expect(result.output.roles.length).toBeGreaterThan(0);
  });

  test('roles include Chief Information Technology Officer', () => {
    const roleNames = result.output.roles.map((r: any) => r.role.toLowerCase());
    const hasCIO = roleNames.some((name: string) =>
      name.includes('chief') || name.includes('cio') || name.includes('information technology')
    );
    expect(hasCIO).toBe(true);
  });

  // ── cross-references ──────────────────────────────────────────────────────

  test('cross-references to ST/* documents are detected', () => {
    const refs = result.output.crossReferences;
    expect(refs.length).toBeGreaterThan(0);
    const hasSTRef = refs.some((r: any) =>
      r.targetDocumentSymbol.startsWith('ST/')
    );
    expect(hasSTRef).toBe(true);
  });

  test('SUPERSEDES reference to ST/AI/2002/5 is detected', () => {
    const refs = result.output.crossReferences;
    const superseded = refs.find((r: any) => r.referenceType === 'SUPERSEDES');
    expect(superseded).toBeDefined();
    expect(superseded.targetDocumentSymbol).toContain('ST/AI');
  });

  test('IMPLEMENTS or RELATES_TO reference to ST/SGB/2007/6 is detected', () => {
    const refs = result.output.crossReferences;
    const sgbRef = refs.find((r: any) =>
      r.targetDocumentSymbol.includes('ST/SGB/2007/6')
    );
    expect(sgbRef).toBeDefined();
  });

  // ── confidence ────────────────────────────────────────────────────────────

  test('confidence score >= 0.7 (date + sections + obligations found)', () => {
    expect(result.output.stats.confidence).toBeGreaterThanOrEqual(0.7);
  });

  // ── stats ─────────────────────────────────────────────────────────────────

  test('stats are populated with section, role, reference counts', () => {
    const { stats } = result.output;
    expect(stats.sectionsFound).toBeGreaterThan(0);
    expect(stats.rolesFound).toBeGreaterThanOrEqual(0);
    expect(stats.referencesFound).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// EDGE CASES
// ────────────────────────────────────────────────────────────────────────────

describe('ExtractUNSOPExecutor — edge cases', () => {
  let executor: ExtractUNSOPExecutor;

  beforeAll(() => {
    executor = new ExtractUNSOPExecutor();
  });

  test('returns error for empty text', async () => {
    const result = await executor.execute({ text: '' }, makeContext());
    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.code).toBe('INVALID_INPUT');
  });

  test('returns error for very short text', async () => {
    const result = await executor.execute({ text: 'Hello.' }, makeContext());
    expect(result.success).toBe(false);
  });

  test('falls back to context.variables.text when params.text is absent', async () => {
    const text = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const result = await executor.execute({}, makeContext({ text }));
    expect(result.success).toBe(true);
  });

  test('overrideIssuingBody overrides detected body', async () => {
    const text = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const result = await executor.execute({ text, overrideIssuingBody: 'UNHCR' }, makeContext());
    expect((result.output as any).document.issuingBody).toBe('UNHCR');
  });

  test('overrideDocumentType overrides detected type', async () => {
    const text = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const result = await executor.execute({ text, overrideDocumentType: 'STANDARD' }, makeContext());
    expect((result.output as any).document.documentType).toBe('STANDARD');
  });

  test('extractSections=false returns empty sections array', async () => {
    const text = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const result = await executor.execute({ text, extractSections: false }, makeContext());
    expect(result.success).toBe(true);
    expect((result.output as any).sections).toEqual([]);
  });
});
