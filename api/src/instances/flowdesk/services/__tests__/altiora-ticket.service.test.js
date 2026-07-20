'use strict';

/**
 * I-7 — DraftSR → Altiora ticket. All I/O injected.
 * The critical invariant: FormDataJson is keyed by the ORIGINAL Altiora field ids
 * (via snapshot.metadata.fieldIdMapping), never by our slotIds.
 */

const {
  createAltioraTicketService, mapDraftToTicketDto, buildFormData, deriveTitleDescription,
} = require('../altiora-ticket.service');
const { AltioraValidationError, AltioraAuthError, AltioraServerError } = require('../altiora-client');

// A materialized-form snapshot (shape the I-4 materializer produces).
const SNAPSHOT = {
  serviceId: 'EO-HR-SA-SS-ISP',
  version: 1,
  phases: ['detail'],
  metadata: {
    title: 'Initiate Separation Process',
    approvalRequired: false,
    altioraOusId: 59,
    fieldIdMapping: {
      subjectTile: 'field_1781818874087',
      descriptionAdditionalNotes: 'field_1781818885795',
      areSupportingDocumentsAttached: 'field_1781818964641',
    },
  },
  slots: [
    { slotId: 'subjectTile', type: 'string', required: true, phase: 'detail' },
    { slotId: 'descriptionAdditionalNotes', type: 'text', required: true, phase: 'detail' },
    { slotId: 'areSupportingDocumentsAttached', type: 'enum', required: true, phase: 'detail' },
  ],
};
const draftWith = (slots) => ({
  serviceId: 'EO-HR-SA-SS-ISP',
  slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { value: v, provenance: 'user_edited' }])),
});

const FILLED = draftWith({
  subjectTile: 'Retirement separation',
  descriptionAdditionalNotes: 'Please initiate the separation process for my upcoming retirement.',
  areSupportingDocumentsAttached: 'No',
});

describe('I-7: DTO mapping', () => {
  test('FormDataJson is keyed by Altiora field ids, not slotIds', () => {
    const fd = buildFormData(FILLED, SNAPSHOT);
    expect(fd).toEqual({
      field_1781818874087: 'Retirement separation',
      field_1781818885795: 'Please initiate the separation process for my upcoming retirement.',
      field_1781818964641: 'No',
    });
    expect(Object.keys(fd)).not.toContain('subjectTile'); // never our ids
  });

  test('slots not in the Altiora form (resolver-only) are omitted from FormDataJson', () => {
    const d = draftWith({ subjectTile: 'x', beneficiary: { userId: 'U9', name: 'Someone' } });
    expect(buildFormData(d, SNAPSHOT)).toEqual({ field_1781818874087: 'x' });
  });

  test('Title/Description derived from subject/description slots', () => {
    const td = deriveTitleDescription(FILLED, SNAPSHOT);
    expect(td.Title).toBe('Retirement separation');
    expect(td.Description).toMatch(/initiate the separation/);
  });

  test('the full DTO carries service code + OUSvcId + form data', () => {
    const dto = mapDraftToTicketDto(FILLED, SNAPSHOT, { userId: 'actor-1' });
    expect(dto).toMatchObject({ ServiceCode: 'EO-HR-SA-SS-ISP', OrganizationUnitServiceId: 59, Status: 'New' });
    expect(JSON.parse(dto.FormDataJson).field_1781818964641).toBe('No');
    expect(dto.BeneficiaryId).toBeUndefined(); // self-service
  });

  test('on-behalf: beneficiary ≠ actor → BeneficiaryId + RequesterId set', () => {
    const d = draftWith({ subjectTile: 'x', beneficiary: { userId: 'U-other', name: 'Other' } });
    const dto = mapDraftToTicketDto(d, SNAPSHOT, { userId: 'actor-1' });
    expect(dto.BeneficiaryId).toBe('U-other');
    expect(dto.RequesterId).toBe('actor-1');
  });

  test('beneficiary == actor → no on-behalf ids (self-service, no HelpdeskExecute)', () => {
    const d = draftWith({ subjectTile: 'x', beneficiary: { userId: 'actor-1' } });
    const dto = mapDraftToTicketDto(d, SNAPSHOT, { userId: 'actor-1' });
    expect(dto.BeneficiaryId).toBeUndefined();
    expect(dto.RequesterId).toBeUndefined();
  });
});

describe('I-7: createTicket', () => {
  function svc({ post } = {}) {
    const client = { post: post || (async () => ({ ticketId: 12345, ticketNumber: 'SR-00012345', status: 'New' })) };
    return createAltioraTicketService({ client, getActingUser: () => ({ userId: 'actor-1' }) });
  }

  test('happy path → returns srNumber/ticketId/status, posts to /api/tickets', async () => {
    let posted = null;
    const s = svc({ post: async (path, dto) => { posted = { path, dto }; return { ticketId: 999, ticketNumber: 'SR-999', status: 'Auth Pending' }; } });
    const r = await s.createTicket(FILLED, SNAPSHOT);
    expect(r).toEqual({ srNumber: 'SR-999', ticketId: 999, status: 'Auth Pending', altiora: true });
    expect(posted.path).toBe('/api/tickets');
    expect(posted.dto.OrganizationUnitServiceId).toBe(59);
  });

  test('refuses a non-Altiora snapshot (no altioraOusId)', async () => {
    const s = svc();
    const local = { ...SNAPSHOT, metadata: { ...SNAPSHOT.metadata, altioraOusId: undefined } };
    await expect(s.createTicket(FILLED, local)).rejects.toThrow(/not Altiora-backed/);
  });

  test('propagates Altiora errors (400/401/500) untouched — POST is never retried', async () => {
    const bad = (Err) => svc({ post: async () => { throw new Err('boom', { status: 400, body: { Message: 'bad' } }); } });
    await expect(bad(AltioraValidationError).createTicket(FILLED, SNAPSHOT)).rejects.toBeInstanceOf(AltioraValidationError);
    await expect(bad(AltioraAuthError).createTicket(FILLED, SNAPSHOT)).rejects.toBeInstanceOf(AltioraAuthError);
    await expect(bad(AltioraServerError).createTicket(FILLED, SNAPSHOT)).rejects.toBeInstanceOf(AltioraServerError);
  });

  test('handles PascalCase ticket response too', async () => {
    const s = svc({ post: async () => ({ TicketId: 7, TicketNumber: 'SR-7', Status: 'New' }) });
    expect(await s.createTicket(FILLED, SNAPSHOT)).toMatchObject({ srNumber: 'SR-7', ticketId: 7 });
  });
});
