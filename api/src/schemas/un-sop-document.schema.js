/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SOP DOCUMENT SCHEMA
 *
 * Structural graph schemas for UN regulatory document types.
 * Based on analysis of UN IT regulatory document patterns:
 *   - ST/SGB series (Secretary-General's Bulletins)
 *   - ST/AI series (Administrative Instructions)
 *   - Agency-specific (UNHCR/AI/*, ILO IGDS, UNDP policies)
 *
 * Compatible with StructuralGraphBuilder for form generation and
 * Knowledge Quantum extraction pipeline.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const { StructuralGraphBuilder, FieldDataType } = require('./structural-graph.schema');

// ────────────────────────────────────────────────────────────────────────────
// ENUMERATIONS
// ────────────────────────────────────────────────────────────────────────────

const UN_ISSUING_BODY = {
  SECRETARIAT: 'SECRETARIAT',
  UNDP:        'UNDP',
  UNHCR:       'UNHCR',
  UNICEF:      'UNICEF',
  WFP:         'WFP',
  FAO:         'FAO',
  ILO:         'ILO',
  UNOPS:       'UNOPS',
  UNICC:       'UNICC',
  WHO:         'WHO',
  IFAD:        'IFAD',
};

const UN_DOCUMENT_TYPE = {
  SGB_BULLETIN:               'SGB_BULLETIN',
  ADMINISTRATIVE_INSTRUCTION: 'ADMINISTRATIVE_INSTRUCTION',
  POLICY:                     'POLICY',
  STANDARD:                   'STANDARD',
  DIRECTIVE:                  'DIRECTIVE',
  STRATEGY:                   'STRATEGY',
  GUIDELINE:                  'GUIDELINE',
  CHARTER:                    'CHARTER',
};

const UN_DEONT_MODALITY = {
  SHALL:              'SHALL',
  MUST:               'MUST',
  IS_RESPONSIBLE_FOR: 'IS_RESPONSIBLE_FOR',
  SHOULD:             'SHOULD',
  MAY:                'MAY',
  MUST_NOT:           'MUST_NOT',
};

const UN_REFERENCE_TYPE = {
  SUPERSEDES:  'SUPERSEDES',
  SUPPLEMENTS: 'SUPPLEMENTS',
  IMPLEMENTS:  'IMPLEMENTS',
  RELATES_TO:  'RELATES_TO',
};

// ────────────────────────────────────────────────────────────────────────────
// UN_REGULATORY_DOCUMENT — base document schema
// ────────────────────────────────────────────────────────────────────────────

function buildUNRegulatoryDocumentSchema() {
  return new StructuralGraphBuilder('UN_REGULATORY_DOCUMENT', {
    namespace: 'UN_SOP',
    label: { en: 'UN Regulatory Document' },
  })
    .addField('documentSymbol', FieldDataType.STRING, {
      required: true,
      description: 'Official UN document symbol, e.g. ST/SGB/2007/6, UNHCR/AI/2024, IGDS 333',
      order: 1,
    })
    .addEnum('issuingBody', Object.values(UN_ISSUING_BODY), {
      required: true,
      description: 'UN entity that issued this document',
      order: 2,
    })
    .addEnum('documentType', Object.values(UN_DOCUMENT_TYPE), {
      required: true,
      description: 'Formal type of the regulatory document',
      order: 3,
    })
    .addField('title', FieldDataType.TEXT, {
      required: true,
      order: 4,
    })
    .addField('effectiveDate', FieldDataType.DATE, {
      required: true,
      description: 'Date the document entered into force',
      order: 5,
    })
    .addField('replacesDocument', FieldDataType.STRING, {
      required: false,
      description: 'Document symbol of the document this supersedes',
      order: 6,
    })
    .addField('legalBasis', FieldDataType.TEXT, {
      required: false,
      description: 'Constitutional article, GA resolution, or Charter provision providing authority',
      order: 7,
    })
    .addField('sourceUrl', FieldDataType.URL, {
      required: false,
      description: 'Canonical URL of the document on UN website or intranet',
      order: 8,
    })
    .build();
}

// ────────────────────────────────────────────────────────────────────────────
// UN_DOCUMENT_SECTION — section within a regulatory document
// ────────────────────────────────────────────────────────────────────────────

function buildUNDocumentSectionSchema() {
  return new StructuralGraphBuilder('UN_DOCUMENT_SECTION', {
    namespace: 'UN_SOP',
    label: { en: 'UN Document Section' },
  })
    .addField('sectionNumber', FieldDataType.STRING, {
      required: true,
      description: 'Hierarchical section number: "1", "2.1", "Annex A"',
      order: 1,
    })
    .addField('title', FieldDataType.STRING, {
      required: true,
      order: 2,
    })
    .addField('content', FieldDataType.TEXT, {
      required: false,
      description: 'Full verbatim text of the section',
      order: 3,
    })
    // obligations stored as JSON-serialized array; extraction pipeline deserializes
    .addArray('obligations', FieldDataType.ANY, {
      label: { en: 'obligations' },
      description: 'Deontically-loaded statements (SHALL/MUST/IS_RESPONSIBLE_FOR) extracted from this section',
      order: 4,
    })
    .build();
}

// ────────────────────────────────────────────────────────────────────────────
// UN_ROLE_ASSIGNMENT — responsibility / accountability mapping
// ────────────────────────────────────────────────────────────────────────────

function buildUNRoleAssignmentSchema() {
  return new StructuralGraphBuilder('UN_ROLE_ASSIGNMENT', {
    namespace: 'UN_SOP',
    label: { en: 'UN Role Assignment' },
  })
    .addField('role', FieldDataType.STRING, {
      required: true,
      description: 'Job title or organisational unit, e.g. "Chief Information Officer"',
      order: 1,
    })
    .addArray('responsibilities', FieldDataType.TEXT, {
      label: { en: 'responsibilities' },
      description: 'Explicit responsibilities listed for this role',
      order: 2,
    })
    .addField('accountableTo', FieldDataType.STRING, {
      required: false,
      description: 'Role or body to which this role reports for the assigned responsibilities',
      order: 3,
    })
    .addField('sectionRef', FieldDataType.STRING, {
      required: false,
      description: 'Section number where the assignment is stated',
      order: 4,
    })
    .build();
}

// ────────────────────────────────────────────────────────────────────────────
// UN_CROSS_REFERENCE — relationship between documents
// ────────────────────────────────────────────────────────────────────────────

function buildUNCrossReferenceSchema() {
  return new StructuralGraphBuilder('UN_CROSS_REFERENCE', {
    namespace: 'UN_SOP',
    label: { en: 'UN Cross Reference' },
  })
    .addField('sourceDocumentSymbol', FieldDataType.STRING, {
      required: true,
      description: 'Document symbol of the citing document',
      order: 1,
    })
    .addField('targetDocumentSymbol', FieldDataType.STRING, {
      required: true,
      description: 'Document symbol of the cited document',
      order: 2,
    })
    .addEnum('referenceType', Object.values(UN_REFERENCE_TYPE), {
      required: true,
      description: 'Semantic relationship between the two documents',
      order: 3,
    })
    .addField('context', FieldDataType.TEXT, {
      required: false,
      description: 'Verbatim sentence from source document establishing the reference',
      order: 4,
    })
    .build();
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Enum constants — use for validation and seeding
  UN_ISSUING_BODY,
  UN_DOCUMENT_TYPE,
  UN_DEONT_MODALITY,
  UN_REFERENCE_TYPE,

  // Schema builders — call to get StructuralGraph definition objects
  buildUNRegulatoryDocumentSchema,
  buildUNDocumentSectionSchema,
  buildUNRoleAssignmentSchema,
  buildUNCrossReferenceSchema,
};
