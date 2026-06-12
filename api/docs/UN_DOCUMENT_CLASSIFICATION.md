# UN Document Classification

## Overview

The `DocumentClassifier` service (`api/src/services/knowledge/document-classifier.js`)
classifies UN documents by type and assigns them an epistemic layer (L0–L5) with a
corresponding normative weight.

Classification rules are stored as `ClassifierRule` nodes in Memgraph, linked to
`DocumentType` nodes. Rules use signal-based scoring against document text and
metadata.

---

## Epistemic Layer Model (L0–L5)

| Layer | Name | Example Documents | normativeWeight |
|-------|------|-------------------|----------------|
| L0 | Constitutional | UN Charter, GA Resolutions | 0.95–1.0 |
| L1 | Regulatory | ST/SGB Secretary-General's Bulletins | 0.85 |
| L2 | Administrative | ST/AI Administrative Instructions, ST/IC Circulars | 0.55–0.70 |
| L3 | Operational | Operational Manuals, Standard Operating Procedures | 0.40 |
| L4 | Empirical | OIOS Audit Reports, JIU Reports, Board of Auditors | 0.00 |
| L5 | Strategic | Secretary-General Reports, ICT Strategy | 0.25 |

**Key principle:** L0 documents are constitutional (highest authority). L4 documents
are purely empirical — they RECORD what happens, not what SHOULD happen
(`normativeWeight = 0`). The Knowledge Triangle uses OPERATIONALIZES edges to link
L1/L2 (what should be) to L3 (what is done) and REVEALS_GAP_IN edges to connect L4
findings back to L1/L2 gaps.

---

## Document Types

| id | Type | Layer | normativeWeight | Document Symbol |
|----|------|-------|----------------|----------------|
| UN_CHARTER | UN Charter | L0 | 1.0 | — |
| GA_RES | General Assembly Resolution | L0 | 0.95 | A/RES/N/N |
| ST_SGB | Secretary-General's Bulletin | L1 | 0.85 | ST/SGB/YYYY/N |
| ST_AI | Administrative Instruction | L2 | 0.70 | ST/AI/YYYY/N |
| ST_IC | Information Circular | L2 | 0.55 | ST/IC/YYYY/N |
| MANUAL | Operational Manual | L3 | 0.40 | — |
| SOP | Standard Operating Procedure | L3 | 0.40 | — |
| OIOS_REP | OIOS Audit Report | L4 | 0.00 | A/N/N (Part II) |
| JIU_REP | JIU Report | L4 | 0.00 | JIU/REP/YYYY/N |
| BOA_REP | Board of Auditors Report | L4 | 0.00 | A/N/5 |
| SG_REP | Secretary-General Report | L5 | 0.25 | A/N/N |
| ICT_STRAT | ICT Strategy Document | L5 | 0.25 | — |

---

## Classification Signals

Five signal types are used to score documents:

| Signal | Fields | Weight usage |
|--------|--------|-------------|
| `keyword_match` | `keywords[]` | Proportion of keywords found in text × weight |
| `title_match` | `keywords[]` | Proportion of keywords found in `metadata.document_title` × weight |
| `section_match` | `sections[]` | Proportion of section headings found in text (uppercase) × weight |
| `header_match` | `pattern` (regex) | 1.0 if regex matches text, 0 otherwise — × weight |
| `structure_match` | `pattern` (`numbered_paragraphs` or `lettered_sections`) | Proportion of structural matches / max × weight |

Signals are scored independently and summed. Final score is clamped to [0, 1].
Classification succeeds when `score >= threshold` (default 0.60 per type).

---

## API

### MCP Tool: `document.classify`

```
Tool: document.classify
Input:
  document_text: string   (first 2000 chars typically)
  document_title?: string
  file_extension?: string

Output:
  document_type_id: string       (e.g., 'ST_SGB' or 'unknown')
  document_type_name: string
  confidence: number             (0–1)
  confidence_level: string       ('HIGH' >=0.85, 'MEDIUM' 0.6-0.85, 'LOW' <0.6)
  alternatives: [{id, name, confidence}]  (top 3 runners-up)
  requires_llm_classification: boolean   (true if score < threshold)
  recommended_prompts: [{promptType, version, promptId}]
```

### Service Methods

```javascript
// Classify a document — returns type, confidence, alternatives
await classifier.classify(documentText, { document_title, file_extension })

// List all document types with epistemic layer
await classifier.listDocumentTypes()
// Returns: [{ id, name, description, epistemicLayer, normativeWeight, availablePrompts }]

// Filter by layer
await classifier.listDocumentTypesByLayer('L4')
// Returns: [{ id, name, epistemicLayer, normativeWeight }]
```

### Cypher Queries

```cypher
-- All documents at a specific epistemic layer
MATCH (dt:DocumentType {epistemicLayer: 'L4'})
RETURN dt.id, dt.name, dt.normativeWeight

-- Query extracted knowledge nodes by source document type
MATCH (n:KnowledgeNode)-[:EXTRACTED_FROM]->(doc:Document)
WHERE doc.documentType = 'ST_SGB'
RETURN n.id, n.content, doc.documentType, doc.epistemicLayer
```

---

## Integration in Ingestion Pipeline

Classification is an AI-driven step invoked by agents, not automatic batch processing:

```
[Agent calls document.classify] → document_type_id + epistemicLayer
        ↓
[Agent calls write-graph executor]
  → stores documentType, epistemicLayer, normativeWeight on Document node
        ↓
[Knowledge Triangle queries use epistemicLayer to find gaps]
```

For automated batch processing, agents should call `document.classify` BEFORE
`ingestion.write_graph` and include classification results in the node properties.

---

## Seeding

Rules are seeded via:

```
node api/scripts/seed-un-document-types.js
```

Creates:
- `DocumentTypeRegistry {id: 'UN_DOCUMENT_REGISTRY'}` — singleton registry
- 12 `DocumentType` nodes with `epistemicLayer` + `normativeWeight`
- 12 `ClassifierRule` nodes (one per type) linked via `[:HAS_CLASSIFIER]`

To add a new document type:
1. Add entry to `UN_DOC_TYPES` array in seed script
2. Define `classifierRules.rules` array with appropriate signals
3. Run seed script (existing types are skipped via ID check)

---

## Tests

```
node api/tests/unit/document-classifier-un.test.js
```

18 tests across 4 suites:
1. Rules loaded from Memgraph (12 types, epistemicLayer exposed)
2. Classification accuracy (9 document types correctly classified)
3. Confidence levels + unknown fallback
4. Epistemic layer property correctness (L0/L4/L1 normativeWeight assertions)

---

## Codex Rules

| Rule | Title |
|------|-------|
| `CODEX-RULE-KM-010` | Document Classification Required Before Knowledge Extraction |
| `CODEX-RULE-KM-011` | Epistemic Layer Determines Normative Weight in Knowledge Triangle |
