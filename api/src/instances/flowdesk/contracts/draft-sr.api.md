# Contract 2 — DraftSR Service API

Persistence: Redis (key `flowdesk:draft:{sessionId}`, TTL 24h default, refreshed on patch).
Materialization: `submit` writes a `:ServiceRequest` node to Memgraph; `escalate` writes an `:Escalation` node linked to the transcript.

State model and invariants are defined by the reference reducer
[`draft-sr.reducer.js`](./draft-sr.reducer.js); the Redis-backed service MUST preserve its semantics.
Shapes are defined by [`draft-sr.schema.json`](./draft-sr.schema.json).

## Operations

| Op | Request | Response | Notes |
|----|---------|----------|-------|
| `create` | `{sessionId, serviceId, schemaVersion, beneficiary?}` | `DraftSR` | Idempotent per sessionId — returns existing draft if present. |
| `get` | `{sessionId}` | `DraftSR \| null` | Read at turn start. |
| `patch` | `{sessionId, patches: Patch[]}` | `DraftSR` | Applies I1 (provenance guard) + I2 (stale cascade) + I3 (TTL refresh). Write at turn end. |
| `setStatus` | `{sessionId, status}` | `DraftSR` | `draft→confirmed` only via this op; `submitted`/`escalated` only via `submit`/`escalate`. |
| `submit` | `{sessionId, idempotencyKey?}` | `{srNumber, nodeId}` \| `{error:{code:'INCOMPLETE', missing[], stale[]}}` | I4: validates required (tref-aware) slots. Idempotent on `idempotencyKey` (default: derived from sessionId). |
| `escalate` | `{sessionId, reason, transcriptRef}` | `{escalationId, nodeId}` | Packages DraftSR + transcript for Tier 1. |

### Patch shape
```
Patch { op: 'set'|'clear', slotId, value?, provenance: 'extracted'|'user_edited'|'context'|'resolved', confidence?, source? }
```

### Invariants (enforced by reducer, tested in draft-sr.contract.test.js)
- **I1** `user_edited` is never overwritten by `extracted` → patch recorded with `rejected:true`, value unchanged.
- **I2** setting slot X marks `stale:true` on every slot whose `dependsOn` includes X.
- **I3** `expiresAt = now + ttl` on every applied patch.
- **I4** `submit` refuses (`INCOMPLETE`) if any tref-required slot is missing OR stale.

### HTTP surface (wraps the ops; preserves existing `/flowdesk/chat` shape)
The chat route continues to own the conversation; DraftSR ops are internal to the
interpreter graph nodes (SR_DRAFT, CONFIRM, SR_SUBMIT) and not separately exposed,
except a read-only `GET /api/v1/flowdesk/draft/:sessionId → DraftSR|null` for the UI draft panel.
