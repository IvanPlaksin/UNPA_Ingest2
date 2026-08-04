'use strict';

/**
 * DOC-2-001 — reading a document into form fields.
 *
 * The model is the untrusted party here. Most of these tests are about what
 * happens when it returns something almost right: a field this form does not
 * have, an enum label where a value was asked for, an empty string, prose
 * wrapped around the JSON. Every one of those has a plausible-looking value on
 * the other side, and a plausible-looking value is what gets confirmed by a
 * user who is not checking.
 */

const {
  extractFromDocument, schemaKey, extractionModel, extractableSlots, ExtractionError, _internals,
} = require('../document-extraction.service');

const PDF = Buffer.from('%PDF-1.7 pretend scan');

const SNAPSHOT = {
  serviceId: 'svc-travel',
  version: 3,
  metadata: { contentHash: 'abc123' },
  slots: [
    { slotId: 'beneficiary', type: 'directory', required: true, promptHint: 'Who is this request for?', resolverRef: 'directory.user' },
    { slotId: 'travelDate', type: 'date', required: true, promptHint: 'Date of travel', helpText: 'The first day of the journey.' },
    {
      slotId: 'cabinClass',
      type: 'enum',
      promptHint: 'Cabin class',
      presentOptions: [{ value: 'ECON', label: 'Economy' }, { value: 'BUS', label: 'Business' }],
    },
    {
      slotId: 'meals',
      type: 'enum',
      multi: true,
      promptHint: 'Meal preferences',
      presentOptions: [{ value: 'VEG', label: 'Vegetarian' }, { value: 'HAL', label: 'Halal' }],
    },
    { slotId: 'purpose', type: 'text', fieldMeaning: 'Why the traveller is going.' },
  ],
};

/** Provider double: returns a canned reply and records what it was asked. */
function mkProvider(text, extra = {}) {
  const calls = [];
  return {
    calls,
    completionWithContent: async (content, opts) => {
      calls.push({ content, opts });
      if (typeof text === 'function') return text(content, opts);
      return { text, model: 'claude-haiku-4-5', tokens: 10, inputTokens: 8, outputTokens: 2, cost: 0.0001, ...extra };
    },
  };
}

const reply = (extracted, confidence) => JSON.stringify({ extracted, confidence });

describe('DOC-2-001: the happy path', () => {
  test('returns what the document stated, with confidence', async () => {
    const provider = mkProvider(reply(
      { beneficiary: 'Ivan Plaksin', travelDate: '2026-09-01', cabinClass: 'ECON' },
      { beneficiary: 'high', travelDate: 'high', cabinClass: 'medium' },
    ));

    const out = await extractFromDocument(PDF, 'itinerary.pdf', 'application/pdf', SNAPSHOT, { provider });

    expect(out.extracted).toEqual({ beneficiary: 'Ivan Plaksin', travelDate: '2026-09-01', cabinClass: 'ECON' });
    expect(out.confidence).toEqual({ beneficiary: 'high', travelDate: 'high', cabinClass: 'medium' });
    expect(out.rejected).toEqual([]);
  });

  test('sends the document BEFORE the question, as one user turn', async () => {
    const provider = mkProvider(reply({}, {}));
    await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });

    const { content } = provider.calls[0];
    expect(content.map((b) => b.type)).toEqual(['document', 'text']);
    expect(content[0].source).toMatchObject({ type: 'base64', media_type: 'application/pdf' });
  });

  test('an image is sent as an image block, not a document block', async () => {
    const provider = mkProvider(reply({}, {}));
    await extractFromDocument(Buffer.from([0x89, 0x50]), 'scan.png', 'image/png', SNAPSHOT, { provider });
    expect(provider.calls[0].content[0].type).toBe('image');
  });

  test('reports the priced usage, so extraction shows up in cost stats', async () => {
    const provider = mkProvider(reply({}, {}));
    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(out.usage).toMatchObject({ tokens: 10, inputTokens: 8, outputTokens: 2, cost: 0.0001 });
  });
});

describe('DOC-2-001: the model is not trusted', () => {
  test('drops a field this form does not have', async () => {
    const provider = mkProvider(reply(
      { travelDate: '2026-09-01', passportNumber: 'X1234567' },
      { travelDate: 'high', passportNumber: 'high' },
    ));

    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });

    expect(out.extracted).toEqual({ travelDate: '2026-09-01' });
    expect(out.rejected).toContainEqual({ slotId: 'passportNumber', reason: 'unknown field' });
  });

  test('drops an enum value outside the declared domain', async () => {
    // "Economy" is the LABEL; the draft stores the VALUE. A model that returns
    // the label produces a value the form cannot accept.
    const provider = mkProvider(reply({ cabinClass: 'Economy' }, { cabinClass: 'high' }));

    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });

    expect(out.extracted).not.toHaveProperty('cabinClass');
    expect(out.rejected).toContainEqual({ slotId: 'cabinClass', reason: 'value not among the allowed options' });
  });

  test('drops an invented enum option that sounds plausible', async () => {
    const provider = mkProvider(reply({ cabinClass: 'FIRST' }, { cabinClass: 'high' }));
    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(out.extracted).not.toHaveProperty('cabinClass');
  });

  test('an empty string is "not found", not a value', async () => {
    const provider = mkProvider(reply({ purpose: '', travelDate: null, beneficiary: undefined }, {}));
    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(out.extracted).toEqual({});
  });

  test('keeps only the valid members of a multi-select, as an array', async () => {
    const provider = mkProvider(reply({ meals: ['VEG', 'KOSHER', 'HAL'] }, { meals: 'medium' }));
    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(out.extracted.meals).toEqual(['VEG', 'HAL']);
  });

  test('a single value for a multi-select becomes an array', async () => {
    const provider = mkProvider(reply({ meals: 'VEG' }, {}));
    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(out.extracted.meals).toEqual(['VEG']);
  });

  test('an array for a single-value field takes the first', async () => {
    const provider = mkProvider(reply({ travelDate: ['2026-09-01', '2026-09-08'] }, {}));
    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(out.extracted.travelDate).toBe('2026-09-01');
  });

  test('a nonsense confidence becomes medium rather than propagating', async () => {
    const provider = mkProvider(reply({ purpose: 'Conference' }, { purpose: 'VERY SURE' }));
    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(out.confidence.purpose).toBe('medium');
  });

  test('a missing confidence block does not lose the values', async () => {
    const provider = mkProvider(JSON.stringify({ extracted: { purpose: 'Conference' } }));
    const out = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(out.extracted).toEqual({ purpose: 'Conference' });
    expect(out.confidence.purpose).toBe('medium');
  });
});

describe('DOC-2-001: getting JSON out of the reply', () => {
  test('reads a bare object', () => {
    expect(_internals.parseJsonReply('{"extracted":{}}')).toEqual({ extracted: {} });
  });

  test('reads a fenced block', () => {
    const out = _internals.parseJsonReply('```json\n{"extracted":{"purpose":"x"}}\n```');
    expect(out.extracted.purpose).toBe('x');
  });

  test('survives a sentence in front of the object — where the greedy brace match fails', () => {
    const text = 'Here is what I found (note: {} means nothing found):\n{"extracted":{"purpose":"Conference"}}';
    expect(_internals.parseJsonReply(text).extracted.purpose).toBe('Conference');
  });

  test('a reply with no JSON at all is a typed parse failure', async () => {
    const provider = mkProvider('I am sorry, I cannot read this document.');
    await expect(extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider }))
      .rejects.toMatchObject({ name: 'ExtractionError', code: 'PARSE_FAILED' });
  });

  test('a JSON array is not an extraction result', () => {
    expect(() => _internals.parseJsonReply('[1,2,3]')).toThrow(ExtractionError);
  });

  test('a brace inside a quoted value does not end the object', () => {
    const text = '{"extracted":{"purpose":"Budget line {A/78/6} review"}}';
    expect(_internals.parseJsonReply(text).extracted.purpose).toBe('Budget line {A/78/6} review');
  });

  test('an escaped quote inside a value does not end the string', () => {
    const text = '{"extracted":{"purpose":"He said \\"go\\" and left"}}';
    expect(_internals.parseJsonReply(text).extracted.purpose).toBe('He said "go" and left');
  });

  test('the real result wins over an incidental object that came first', () => {
    const text = 'Example of an empty answer: {"extracted":{}}. My actual answer:\n{"extracted":{"purpose":"Conference"}}';
    expect(_internals.parseJsonReply(text).extracted.purpose).toBe('Conference');
  });
});

describe('DOC-2-001: the prompt describes the real form', () => {
  const prompt = () => _internals.buildSystemPrompt(SNAPSHOT.slots);

  test('uses promptHint as the field question', () => {
    expect(prompt()).toContain('Who is this request for?');
    expect(prompt()).toContain('Date of travel');
  });

  test('carries helpText as guidance', () => {
    expect(prompt()).toContain('The first day of the journey.');
  });

  test('falls back to fieldMeaning when there is no promptHint', () => {
    expect(prompt()).toContain('Why the traveller is going.');
  });

  test('lists enum options and asks for the VALUE, not the label', () => {
    const p = prompt();
    expect(p).toContain('ECON (Economy)');
    expect(p).toContain('BUS (Business)');
    expect(p).toMatch(/return the value, not the label/i);
  });

  test('marks a multi-select as taking an array', () => {
    expect(prompt()).toMatch(/multiple values allowed/i);
  });

  test('marks required fields', () => {
    expect(prompt()).toContain('(date, required)');
  });

  test('tells the model that omitting is correct — the anti-invention rule', () => {
    expect(prompt()).toMatch(/An absent field is a correct answer/i);
  });

  test('caps a huge option list instead of pasting hundreds of values', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ value: `V${i}`, label: `Label ${i}` }));
    const line = _internals.describeSlot({ slotId: 'x', type: 'enum', promptHint: 'X', presentOptions: many });
    expect(line).toContain('…15 more');
    expect(line).not.toContain('V39');
  });
});

describe('DOC-2-001: refusals and failures', () => {
  test('a file over the request budget never reaches the model', async () => {
    const huge = { length: 30 * 1024 * 1024 };
    Object.setPrototypeOf(huge, Buffer.prototype);
    const provider = mkProvider(reply({}, {}));

    await expect(extractFromDocument(huge, 'big.pdf', 'application/pdf', SNAPSHOT, { provider }))
      .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(provider.calls).toHaveLength(0);
  });

  test('an unreadable type is refused before the model, by name', async () => {
    const provider = mkProvider(reply({}, {}));
    await expect(extractFromDocument(Buffer.from('x'), 'a.docx', 'application/msword', SNAPSHOT, { provider }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
    expect(provider.calls).toHaveLength(0);
  });

  test('a form with no fields is refused rather than asked about', async () => {
    const provider = mkProvider(reply({}, {}));
    await expect(extractFromDocument(PDF, 'a.pdf', 'application/pdf', { serviceId: 's', slots: [] }, { provider }))
      .rejects.toMatchObject({ code: 'NO_FIELDS' });
    expect(provider.calls).toHaveLength(0);
  });

  test.each([
    'prompt is too long: 250000 tokens > 200000 maximum',
    'PDF has 412 pages, exceeds the maximum of 100',
    'request too large',
  ])('a page/length refusal from the API becomes DOCUMENT_TOO_LONG: %s', async (msg) => {
    const provider = mkProvider(() => { throw new Error(msg); });
    await expect(extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider }))
      .rejects.toMatchObject({ code: 'DOCUMENT_TOO_LONG' });
  });

  test('the too-long message names no page count — the limit moves with the model', async () => {
    const provider = mkProvider(() => { throw new Error('PDF has 412 pages, exceeds the maximum of 100'); });
    const err = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider }).catch((e) => e);

    expect(err.message).toMatch(/too large for me to read in full/i);
    expect(err.message).not.toMatch(/\d/);
    expect(err.message).toMatch(/attach just the pages/i);
  });

  test('any other API failure is EXTRACTION_FAILED, with the cause kept off the user message', async () => {
    const provider = mkProvider(() => { throw new Error('bolt://memgraph:7687 refused'); });
    const err = await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider }).catch((e) => e);

    expect(err.code).toBe('EXTRACTION_FAILED');
    expect(err.message).not.toMatch(/bolt|memgraph/);
    expect(err.details.cause).toMatch(/bolt/);
  });
});

describe('DOC-2-001: model selection is an instance setting', () => {
  const prev = process.env.FLOWDESK_EXTRACTION_MODEL;
  afterEach(() => {
    if (prev === undefined) delete process.env.FLOWDESK_EXTRACTION_MODEL;
    else process.env.FLOWDESK_EXTRACTION_MODEL = prev;
  });

  test('defaults to Haiku 4.5', () => {
    delete process.env.FLOWDESK_EXTRACTION_MODEL;
    expect(extractionModel()).toBe('claude-haiku-4-5');
  });

  test('is read at call time, so a running deployment can be switched', async () => {
    delete process.env.FLOWDESK_EXTRACTION_MODEL;
    const provider = mkProvider(reply({}, {}));

    await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(provider.calls[0].opts.model).toBe('claude-haiku-4-5');

    process.env.FLOWDESK_EXTRACTION_MODEL = 'claude-sonnet-5';
    await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider });
    expect(provider.calls[1].opts.model).toBe('claude-sonnet-5');
  });

  test('an explicit model beats the setting', async () => {
    const provider = mkProvider(reply({}, {}));
    await extractFromDocument(PDF, 'a.pdf', 'application/pdf', SNAPSHOT, { provider, model: 'claude-opus-5' });
    expect(provider.calls[0].opts.model).toBe('claude-opus-5');
  });
});

describe('DOC-2-001: schemaKey', () => {
  test('prefers contentHash — a schema can be edited without its version moving', () => {
    expect(schemaKey(SNAPSHOT)).toBe('svc-travel:abc123');
  });

  test('falls back to version, then to a constant', () => {
    expect(schemaKey({ serviceId: 's', version: 7 })).toBe('s:7');
    expect(schemaKey({ serviceId: 's' })).toBe('s:v1');
    expect(schemaKey(null)).toBeNull();
  });

  test('changes when the form changes, which is what invalidates a cached extraction', () => {
    const edited = { ...SNAPSHOT, metadata: { contentHash: 'def456' } };
    expect(schemaKey(edited)).not.toBe(schemaKey(SNAPSHOT));
  });
});

describe('DOC-2-001: extractableSlots', () => {
  test('includes directory slots — the name is extracted, the resolver does the rest', () => {
    expect(extractableSlots(SNAPSHOT).map((s) => s.slotId)).toContain('beneficiary');
  });

  test('honours an explicit opt-out', () => {
    const snap = { slots: [{ slotId: 'a' }, { slotId: 'b', extractable: false }] };
    expect(extractableSlots(snap).map((s) => s.slotId)).toEqual(['a']);
  });

  test('a snapshot with no slots is empty, not a crash', () => {
    expect(extractableSlots(null)).toEqual([]);
    expect(extractableSlots({})).toEqual([]);
  });
});
