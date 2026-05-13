# FlowDesk AI Service — Integration Readiness Report

**Date:** 2026-04-13  
**Prepared by:** ProjectAdvisor AI Engineering Team  
**Audience:** FlowDesk Portal Development Team  
**Status:** Ready for Review

---

## 1. Executive Summary

The AI Service for FlowDesk intake dialog is **functionally complete at demo level** — classification, multi-turn dialog, service request creation, and handler routing all work end-to-end. The main integration gap is **API contract mismatch**: we currently expose a synchronous REST API, while the FD Portal team expects an asynchronous polling-based contract. Additionally, there is a **data ownership question** — our AI Service currently owns the service catalog, user directory, and location data, whereas the expected architecture has the AI Service calling back to the FD Backend for this data. These two gaps require a joint architectural decision before production integration.

**What works today:**
- 3-level classification pipeline (keyword < 1ms, semantic ~170ms, LLM ~2s)
- 11-step intake dialog: intent → clarification → location → beneficiary → confirmation → SR creation
- 55+ service categories across 8 domains (IT, HR, SEC, FAC, FIN, LOG, COM, LEG)
- Graph-based handler routing with mission → regional → global priority
- SLA monitoring, ticket lifecycle, config management via Knowledge Base

**What needs alignment:**
- Sync vs async API contract
- Data ownership (catalog, users, locations)
- Session persistence (currently in-memory)
- Response type schema standardization

---

## 2. Architecture Overview

### 2.1 Components

```
┌─────────────────────────────────────────────────────────┐
│                    AI Service                            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Classification│  │ Dialog Engine │  │   Routing    │  │
│  │   Pipeline    │  │  (11 nodes)  │  │   Service    │  │
│  │  L1→L2→L3    │  │              │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│  ┌──────┴─────────────────┴──────────────────┴───────┐  │
│  │              Runtime Engine (AOPEG)                │  │
│  │         33 Executors across 3 layers              │  │
│  └───────────────────────┬───────────────────────────┘  │
│                          │                              │
│  ┌───────────┐  ┌────────┴───┐  ┌───────────┐          │
│  │  Qdrant   │  │  Memgraph  │  │   Redis    │          │
│  │ (vectors) │  │ (knowledge │  │  (cache)   │          │
│  │           │  │   graph)   │  │            │          │
│  └───────────┘  └────────────┘  └───────────┘          │
│                                                         │
│  ┌───────────┐  ┌────────────┐                          │
│  │    TEI    │  │ Claude API │                          │
│  │(embeddings│  │  (LLM L3)  │                          │
│  └───────────┘  └────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Classification Pipeline

| Level | Method | Latency | Confidence | When Used |
|-------|--------|---------|------------|-----------|
| **L1** | Keyword regex (55 patterns, 6 languages) | < 1ms | 0.95 fixed | Obvious requests: "password reset", "laptop" |
| **L2** | Semantic vector search (TEI → Qdrant) | ~170ms | 0.55–0.90 | Fuzzy/natural language requests |
| **L3** | LLM classification (Claude API) | ~2s | 0.50–1.0 | Ambiguous requests, L2 low confidence |

Confidence thresholds are **configurable at runtime** via Knowledge Base (Memgraph), no code changes needed.

### 2.3 Dialog Workflow

The intake dialog follows an 11-node graph:

```
START → Classify Intent ──high──→ Check Location ──has_loc──→ Ask Beneficiary ──self──→ Confirm → Spawn Process → END
                        ├─medium→ Clarify Intent ─────────↗                   └─other→ Find User ──found──↗
                        └─low───→ Open Query ─────────────↗
                                 Check Location ──no_loc──→ Ask Location → (Select Location) ↗
```

**Each node** can:
- Return a text response to the user
- Present choice buttons (up to 6 options)
- Pause and wait for user input (`WAIT_FOR_INPUT`)
- Pass through silently (data collection nodes)

### 2.4 Service Catalog Coverage

| Domain | Code | Example Services | Count |
|--------|------|-----------------|-------|
| IT | IT-* | Hardware, Software, Network, Security, Collaboration | ~25 |
| HR | HR-* | Benefits, Learning, Onboarding | ~10 |
| Security | SEC-* | Badges, Access, Visitors | ~4 |
| Facilities | FAC-* | Rooms, Building, Workspace, Travel | ~15 |
| Finance | FIN-* | Expenses, Invoices, Procurement | ~4 |
| Logistics | LOG-* | Supplies, Courier | ~2 |
| Communications | COM-* | Design, Video, Announcements | ~5 |

Each service has: `code`, `name`, `description`, `sla_hours`, `approval_required`, `domain_code`, `category`.

---

## 3. Deployment

### 3.1 Azure Compatibility: YES

The AI Service is fully deployable on Azure. No vendor lock-in to non-Azure services.

### 3.2 Required Azure Services

| Component | Azure Service | SKU / Tier | Purpose |
|-----------|--------------|------------|---------|
| **AI Service** (Node.js) | App Service | P2v3 (2 vCPU, 8 GB) | Main API server |
| **Memgraph** (graph DB) | Azure Container Instances | 2 vCPU, 4 GB | Knowledge graph (users, catalog, locations, tickets) |
| **Qdrant** (vector DB) | Azure Container Instances | 2 vCPU, 4 GB | Semantic search embeddings |
| **TEI** (text embeddings) | Azure Container Instances | 2 vCPU, 4 GB (+ GPU optional) | Embedding generation |
| **Redis** | Azure Cache for Redis | C1 (1 GB) | Config caching, session persistence |
| **LLM** | Anthropic Claude API (external) | Pay-per-use | L3 classification fallback |

**Alternative LLM option:** Azure OpenAI Service (GPT-4o) can replace Claude API if Azure-native is required. The LLM interface is abstracted — switching requires config change only, no code changes.

### 3.3 Estimated Monthly Cost

| Tier | Configuration | Est. Cost |
|------|--------------|-----------|
| **Dev/Test** | App Service B2, ACI minimal, Redis Basic | ~$300/mo |
| **Production** | App Service P2v3, ACI standard, Redis C1 | ~$750–1,200/mo |
| **Production + GPU** | Above + GPU for TEI | ~$1,500–2,000/mo |

### 3.4 Compliance Notes

- Memgraph and Qdrant run as self-hosted containers — **no data leaves Azure tenant**
- TEI runs locally — embeddings are generated in-tenant
- Only Claude API calls go external (can be replaced with Azure OpenAI)
- Redis data is encrypted at rest (Azure managed)

---

## 4. Integration Contract

### 4.1 Expected vs Current API

| # | Expected (FD Portal Doc) | Current (AI Service) | Gap |
|---|--------------------------|---------------------|-----|
| 1 | `POST /session/start` → creates session | Session created implicitly on first `POST /chat` | **Minor** — can add explicit endpoint |
| 2 | `POST /prompt` → returns `{turnId, status: "pending"}` | `POST /chat` → returns full response synchronously | **Major** — sync vs async |
| 3 | `GET /response/{sessionId}/{turnId}` → polling | Not implemented (not needed with sync) | **Major** — polling not implemented |
| 4 | Response types: `text`, `options`, `service_request` | Flat response: `{response, choices, state, isComplete}` | **Medium** — needs type field |
| 5 | Backend callbacks: `/internal/users/resolve` | AI Service owns user data (Memgraph) | **Architectural** — data ownership |
| 6 | Backend callbacks: `/internal/catalog/search` | AI Service owns catalog (Qdrant + Memgraph) | **Architectural** — data ownership |
| 7 | Backend callbacks: `/internal/request/resolve` | AI Service creates SR in Memgraph | **Architectural** — data ownership |

### 4.2 Proposed Alignment Options

#### Option A: AI Service adapts to FD Portal contract
**We** create an adapter layer that wraps our sync engine in async polling semantics.

```
FD Portal → POST /session/start → AI Service creates session, returns sessionId
FD Portal → POST /prompt {sessionId, message} → AI Service returns {turnId, status: "pending"}
         (internally: calls sync engine, caches result)
FD Portal → GET /response/{sessionId}/{turnId} → AI Service returns cached result
```

- **Effort:** 1–2 weeks
- **Risk:** Low — no changes to core engine
- **Downside:** Polling is artificial (response is already available)

#### Option B: FD Portal adapts to AI Service sync API
**They** call `POST /chat` directly and handle the synchronous response.

```
FD Portal → POST /api/v1/flowdesk/chat {sessionId, userId, message}
         ← {response, choices, state, currentNode, executionLog, isComplete}
```

- **Effort:** 0 for us, ~1 week for them
- **Risk:** Low
- **Downside:** They need to adjust their frontend expectations

#### Option C: Hybrid — thin adapter + data callbacks
**We** add `/session/start` and response `type` field. **They** provide callback endpoints for catalog/users/locations that we call instead of our local DB.

- **Effort:** 2–3 weeks (both sides)
- **Risk:** Medium — requires careful contract definition
- **Benefit:** Clean separation of concerns

### 4.3 Data Ownership Question

This is the **most important architectural decision** to make together.

| Data | Current Owner | Expected Owner (per doc) | Recommendation |
|------|--------------|------------------------|----------------|
| **Service Catalog** | AI Service (Memgraph + Qdrant) | FD Backend | Keep in AI Service — needed for semantic search |
| **User Directory** | AI Service (Memgraph) | FD Backend | **Delegate to FD Backend** via callback |
| **Locations** | AI Service (Memgraph) | FD Backend | **Delegate to FD Backend** via callback |
| **Service Requests** | AI Service (Memgraph) | FD Backend | **Delegate to FD Backend** via callback |
| **Classification Config** | AI Service (Memgraph + Redis) | AI Service | Keep in AI Service |

**Recommended split:** AI Service owns classification intelligence (catalog, embeddings, thresholds). FD Backend owns transactional data (users, locations, SRs). AI Service calls FD Backend callbacks for user/location resolution and SR creation.

---

## 5. Response Contract

### 5.1 Current Response Schema

```json
{
  "response": "I identified your request as **Laptop Request**. Let me collect the details.",
  "choices": [
    { "label": "Laptop Request", "value": "1", "variant": "primary" },
    { "label": "Desktop Request", "value": "2" },
    { "label": "Something else", "value": "other", "variant": "secondary" }
  ],
  "state": {
    "intent": "IT-HW-LAP",
    "service_name": "Laptop Request",
    "location": "Brindisi",
    "beneficiary": "self",
    "confirmed": false,
    "requestId": null
  },
  "currentNode": "D6-ASK-BENEF",
  "executionLog": [ ... ],
  "isComplete": false,
  "engineStatus": "WAITING_FOR_INPUT",
  "spawnResult": null
}
```

### 5.2 Proposed Aligned Response Schema

To align with the expected `type` field:

```json
{
  "sessionId": "sess-abc123",
  "turnId": "turn-001",
  "type": "options",
  "text": "I identified your request as **Laptop Request**. Let me collect the details.",
  "options": [
    { "label": "Laptop Request", "value": "1" },
    { "label": "Desktop Request", "value": "2" },
    { "label": "Something else", "value": "other" }
  ],
  "state": {
    "intent": "IT-HW-LAP",
    "service_name": "Laptop Request",
    "location": "Brindisi",
    "beneficiary": "self",
    "confirmed": false
  },
  "isComplete": false,
  "serviceRequest": null
}
```

Type derivation logic:
- `choices` present → `type: "options"`
- `spawnResult` present with `requestId` → `type: "service_request"`
- Otherwise → `type: "text"`

---

## 6. Timeline & Next Steps

### What we can deliver in 1 week (no external dependencies):
- Add explicit `POST /session/start` endpoint
- Add `type` field to response (`text` / `options` / `service_request`)
- Add `turnId` tracking
- Move sessions from in-memory to Redis
- Document full OpenAPI/Swagger spec

### What requires joint decision (before we can proceed):
- Sync vs async API: Option A, B, or C?
- Data ownership: Who owns users/locations/SRs?
- LLM provider: Claude API (external) vs Azure OpenAI (Azure-native)?
- Authentication: How does FD Portal authenticate to AI Service?

### Suggested next step:
**30-minute sync meeting** to align on the 4 open questions above. After that, we can deliver an integration-ready API in 1–2 weeks.

---

## 7. Open Questions for Discussion

1. **Sync vs Async?** Our engine responds in 200ms–3s. Is polling truly needed, or can FD Portal handle sync responses with a loading spinner?

2. **Data Callbacks:** If we delegate user/location resolution to FD Backend, what are the endpoint contracts? Expected latency?

3. **Service Catalog Sync:** Should the service catalog be duplicated (FD Backend + AI Service), or should AI Service be the single source of truth for classification?

4. **Authentication:** JWT? API key? Azure AD? What auth mechanism should AI Service expect from FD Portal?

5. **Multi-language Support:** We support 6 languages in keyword classification (EN, RU, FR, ES, AR, ZH). Does FD Portal need all of them or a subset?

6. **Graph Versioning:** AI Service supports multiple dialog graph versions. Should FD Portal be able to select which version to use, or always use latest?

7. **Monitoring & Observability:** Do you need execution logs (which nodes ran, latency per node) in the response, or only the final result?

8. **Error Handling Contract:** What should FD Portal expect when AI Service is degraded (e.g., Qdrant down → no L2, only L1+L3)?

---

*This report was generated from live codebase analysis on 2026-04-13.*
