'use strict';

const { parseUNSymbol, deriveSymbolRelations } = require('../symbol-parser');

describe('parseUNSymbol — organ + series decomposition', () => {
  test('GA resolution A/RES/78/1', () => {
    const p = parseUNSymbol('A/RES/78/1');
    expect(p.valid).toBe(true);
    expect(p.organ).toBe('GA');
    expect(p.series).toBe('RES');
    expect(p.session).toBe(78);
    expect(p.number).toBe(1);
    expect(p.documentType).toBe('GA_RES');
    expect(p.epistemicLayer).toBe('L0');
    expect(p.normativeWeight).toBe(0.95);
  });

  test('SC resolution with year S/RES/2235(2015)', () => {
    const p = parseUNSymbol('S/RES/2235(2015)');
    expect(p.valid).toBe(true);
    expect(p.organ).toBe('SC');
    expect(p.series).toBe('RES');
    expect(p.number).toBe(2235);
    expect(p.year).toBe(2015);
    expect(p.documentType).toBe('SC_RES');
    expect(p.epistemicLayer).toBe('L0');
    expect(p.normativeWeight).toBe(0.98);
  });

  test('SC presidential statement S/PRST/2024/1', () => {
    const p = parseUNSymbol('S/PRST/2024/1');
    expect(p.organ).toBe('SC');
    expect(p.series).toBe('PRST');
    expect(p.session).toBe(2024);
    expect(p.number).toBe(1);
    expect(p.documentType).toBe('SC_PRST');
    expect(p.epistemicLayer).toBe('L1');
  });

  test('SC dated document S/2024/100 (no series code)', () => {
    const p = parseUNSymbol('S/2024/100');
    expect(p.organ).toBe('SC');
    expect(p.series).toBe(null);
    expect(p.session).toBe(2024);
    expect(p.number).toBe(100);
    // no (organ,series) mapping → documentType left for classifier
    expect(p.documentType).toBe(null);
  });

  test("Secretary-General's Bulletin ST/SGB/2024/1", () => {
    const p = parseUNSymbol('ST/SGB/2024/1');
    expect(p.organ).toBe('SEC');
    expect(p.series).toBe('SGB');
    expect(p.documentType).toBe('ST_SGB');
    expect(p.epistemicLayer).toBe('L1');
    expect(p.normativeWeight).toBe(0.85);
  });

  test('Administrative Instruction ST/AI/2024/2', () => {
    const p = parseUNSymbol('ST/AI/2024/2');
    expect(p.series).toBe('AI');
    expect(p.documentType).toBe('ST_AI');
    expect(p.epistemicLayer).toBe('L2');
  });

  test('ECOSOC resolution E/RES/2024/1', () => {
    const p = parseUNSymbol('E/RES/2024/1');
    expect(p.organ).toBe('ECOSOC');
    expect(p.series).toBe('RES');
    expect(p.session).toBe(2024);
    expect(p.number).toBe(1);
  });

  test('JIU report JIU/REP/2024/1', () => {
    const p = parseUNSymbol('JIU/REP/2024/1');
    expect(p.organ).toBe('JIU');
    expect(p.series).toBe('REP');
    expect(p.documentType).toBe('JIU_REP');
    expect(p.epistemicLayer).toBe('L4');
    expect(p.normativeWeight).toBe(0.00);
  });
});

describe('parseUNSymbol — subsidiary bodies', () => {
  test('Human Rights Council A/HRC/RES/52/1', () => {
    const p = parseUNSymbol('A/HRC/RES/52/1');
    expect(p.organ).toBe('GA');
    expect(p.subBody).toBe('HRC');
    expect(p.series).toBe('RES');
    expect(p.session).toBe(52);
    expect(p.number).toBe(1);
  });

  test('First Committee draft A/C.1/78/L.5', () => {
    const p = parseUNSymbol('A/C.1/78/L.5');
    expect(p.organ).toBe('GA');
    expect(p.subBody).toBe('C.1');
    expect(p.series).toBe('L');
    expect(p.session).toBe(78);
    expect(p.number).toBe(5);
  });
});

describe('parseUNSymbol — suffix modifiers', () => {
  test('addendum A/RES/70/1/Add.1', () => {
    const p = parseUNSymbol('A/RES/70/1/Add.1');
    expect(p.baseSymbol).toBe('A/RES/70/1');
    expect(p.suffixType).toBe('ADDENDUM');
    expect(p.suffixNumber).toBe(1);
    // base structure still parsed
    expect(p.organ).toBe('GA');
    expect(p.series).toBe('RES');
    expect(p.number).toBe(1);
  });

  test('corrigendum S/RES/2235(2015)/Corr.1', () => {
    const p = parseUNSymbol('S/RES/2235(2015)/Corr.1');
    expect(p.baseSymbol).toBe('S/RES/2235(2015)');
    expect(p.suffixType).toBe('CORRIGENDUM');
    expect(p.suffixNumber).toBe(1);
    expect(p.year).toBe(2015);
  });

  test('revision A/RES/70/1/Rev.2', () => {
    const p = parseUNSymbol('A/RES/70/1/Rev.2');
    expect(p.suffixType).toBe('REVISION');
    expect(p.suffixNumber).toBe(2);
    expect(p.baseSymbol).toBe('A/RES/70/1');
  });

  test('stacked A/RES/70/1/Rev.1/Add.1 — outermost modifier wins', () => {
    const p = parseUNSymbol('A/RES/70/1/Rev.1/Add.1');
    expect(p.suffixType).toBe('ADDENDUM');
    expect(p.baseSymbol).toBe('A/RES/70/1/Rev.1');
  });
});

describe('parseUNSymbol — normalization + invalid input', () => {
  test('filename artifact S_RES_2319(2016)-EN.pdf normalizes', () => {
    const p = parseUNSymbol('S_RES_2319(2016)-EN.pdf');
    expect(p.normalized).toBe('S/RES/2319(2016)');
    expect(p.organ).toBe('SC');
    expect(p.number).toBe(2319);
    expect(p.year).toBe(2016);
  });

  test('empty string → invalid', () => {
    const p = parseUNSymbol('');
    expect(p.valid).toBe(false);
    expect(p.parseErrors.length).toBeGreaterThan(0);
  });

  test('non-symbol text → invalid, no crash', () => {
    const p = parseUNSymbol('Some Report Title');
    expect(p.valid).toBe(false);
  });

  test('unknown organ prefix → invalid but tolerated', () => {
    const p = parseUNSymbol('XYZ/RES/1/2');
    expect(p.valid).toBe(false);
    expect(p.parseErrors.some(e => e.includes('unknown organ'))).toBe(true);
    // still decomposes what it can
    expect(p.series).toBe('RES');
  });
});

describe('deriveSymbolRelations', () => {
  test('addendum → base HAS_ADDENDUM this', () => {
    const rels = deriveSymbolRelations('A/RES/70/1/Add.1');
    expect(rels).toHaveLength(1);
    expect(rels[0].relType).toBe('HAS_ADDENDUM');
    expect(rels[0].sourceSymbol).toBe('A/RES/70/1');
    expect(rels[0].targetSymbol).toBe('A/RES/70/1/Add.1');
    expect(rels[0].confidence).toBe(1.0);
    expect(rels[0].source).toBe('SYMBOL_DERIVED');
  });

  test('corrigendum → this CORRECTS base', () => {
    const rels = deriveSymbolRelations('S/RES/2235(2015)/Corr.1');
    expect(rels[0].relType).toBe('CORRECTS');
    expect(rels[0].sourceSymbol).toBe('S/RES/2235(2015)/Corr.1');
    expect(rels[0].targetSymbol).toBe('S/RES/2235(2015)');
  });

  test('revision → this REVISES base', () => {
    const rels = deriveSymbolRelations('A/RES/70/1/Rev.2');
    expect(rels[0].relType).toBe('REVISES');
    expect(rels[0].targetSymbol).toBe('A/RES/70/1');
  });

  test('no suffix → no derived relations', () => {
    expect(deriveSymbolRelations('A/RES/78/1')).toHaveLength(0);
  });
});
