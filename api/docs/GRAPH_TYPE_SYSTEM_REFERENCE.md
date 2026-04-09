# Graph Type System — Complete Reference

> 10 types, 3 dimensions, 15 Codex rules
> Generated 2026-03-30

## Types Overview

```
                Definition      Instance        Derived
EXECUTION    │ TEMPLATE       │ EXECUTABLE    │ COMPOSITE
             │ PROCESS        │               │
DATA         │ STRUCTURAL     │ STORABLE      │ PROJECTION
GOVERNANCE   │ CONSTRAINT     │ VALIDATION    │ (empty)
EVENT: immutable audit journal (standalone)
```

## Type Details

| Type | Dimension | canExecute | Key Trait | Status |
|------|-----------|------------|-----------|--------|
| EXECUTABLE | EXECUTION | yes | Directly runnable DAG | ✓ Production |
| TEMPLATE | EXECUTION | no | Requires instantiation | ⚠️ Gate only |
| COMPOSITE | EXECUTION | yes | Orchestrates sub-graphs | ⚠️ Partial |
| PROCESS | EXECUTION | no | Requires compilation | ⏳ Design |
| STRUCTURAL | DATA | no | Defines data structure (class) | ✓ Production |
| STORABLE | DATA | no | Instance of STRUCTURAL | ⏳ Design |
| PROJECTION | DATA | no | Derived read-only view | ⏳ Design |
| CONSTRAINT | GOVERNANCE | no | Validation rules for STRUCTURAL | ✓ Production |
| VALIDATION | GOVERNANCE | yes | Runtime read-only checks | ⚠️ Partial |
| EVENT | GOVERNANCE | no | Append-only audit log | ⚠️ Partial |

## SubType Routing (EXECUTABLE only)

| SubType | Checkpoint | SAGA | Pattern |
|---------|------------|------|---------|
| dialog | ✓ | ✗ | Re-execution per conversation turn |
| business | ✗ | ✓ | Compensate on failure |
| extraction | ✓ | ✗ | Spiral convergence |

## Relationships

- `CONSTRAINS`: CONSTRAINT → STRUCTURAL
- `CONFORMS_TO`: STORABLE → STRUCTURAL
- `COMPILES_TO`: PROCESS → EXECUTABLE; STRUCTURAL → JSON Schema; CONSTRAINT → Zod+JSON Schema

## Codex Rules (15)

### MUST (5)
- **GTS-001**: Graph Must Have graphType
- **GTS-002**: EXECUTABLE Requires Valid SubType
- **GTS-003**: CONSTRAINT Must Link to STRUCTURAL
- **GTS-004**: STORABLE Must Conform to STRUCTURAL
- **GTS-005**: RuntimeEngine Must Enforce Type Gates

### SHOULD (5)
- **GTS-006**: Complex Forms (5+ fields) Should Use STRUCTURAL
- **GTS-007**: STRUCTURAL Should Have CONSTRAINT
- **GTS-008**: Dialog Workflows (2+ WAIT) Should Set SubType
- **GTS-009**: COMPOSITE Should Define Isolation Policy
- **GTS-010**: STRUCTURAL Fields Should Have i18n Labels (en + UN language)

### MUST_NOT (5)
- **GTS-011**: Never Execute Non-Executable Types
- **GTS-012**: Never Create Orphan CONSTRAINT
- **GTS-013**: Never Flatten COMPOSITE Without Analysis
- **GTS-014**: Never Store Validation Logic in Executors
- **GTS-015**: Never Skip Type Migration

## Key Files

| File | Purpose |
|------|---------|
| `api/src/services/graph-classification.service.js` | 10 types + metadata |
| `api/src/runtime/RuntimeEngine.js` | Type gates + subType routing |
| `api/src/schemas/structural-graph.schema.js` | STRUCTURAL builder |
| `api/src/schemas/constraint-graph.schema.js` | CONSTRAINT builder |
| `api/src/compilers/structural-to-jsonschema.js` | STRUCTURAL → JSON Schema |
| `api/src/compilers/constraint-compiler.js` | CONSTRAINT → Zod + visibility |
| `api/src/services/structural-form.service.js` | Form spec service |
| `api/src/routes/structural-form.route.js` | Form REST API |
| `api/src/routes/structural.route.js` | CRUD API |
| `api/scripts/seed-codex-graph-type-rules.js` | 15 Codex rules seed |

## Metrics

- 109 backend tests passing
- 116 graphs migrated with graphType
- 2 STRUCTURAL + 2 CONSTRAINT production graphs
- 1 EXECUTABLE/dialog fully adapted (EX SOP5)
