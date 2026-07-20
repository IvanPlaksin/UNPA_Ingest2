# I-8 — Broader E2E Verification

**Run:** 2026-07-16T15:41:06Z · **Mode:** graph

## Summary

| Metric | Value |
|---|---|
| Services in catalog | 79 |
| Resolved to correct code | 79/79 |
| Materialized + baked (has form) | 76/76 |
| No published form | 3 |
| Pipeline errors | 0 |
| Deep E2E tiers | 3 |
| Real tickets created | 3 |

## Deep E2E (per tier)

| Service | Tier | Slots | Enums | Conds | LOV | choice-control | Ticket | Status |
|---|---|---|---|---|---|---|---|---|
| EO-FIN-GM-GA-ACA | SIMPLE | 3 | 1 | 0 | 0 | ✓ | TKT-2026-000077 | PASS |
| EO-HR-TS-REC | MEDIUM-conditional | 12 | 2 | 5 | 0 | ✓ | TKT-2026-000078 | PASS |
| EO-HR-PM-CMP | MEDIUM-LOV | 12 | 4 | 0 | 1 | ✓ | TKT-2026-000079 | PASS |

## Broad sweep — failures & warnings

| Service | Materialized | Issue |
|---|---|---|
| EO-HR-AP-AP-HNI | false | no published form |
| EO-HR-HRA-E-FD | false | no published form |
| EO-HR-PM-PM-CNP | false | no published form |

## Resolution (recall) — misses

_All display names resolved to their own service code._

## Pass 2 — Altiora-mode verification

Verified in an **isolated process** (the live shared API was NOT flipped to altiora mode — that runtime-behavior change on a production-connected integration is the user's decision, per the pilot config ruling):

| Check | Result |
|---|---|
| On-demand materialize (orchestrator loadSnapshot) | ✓ EO-HR-PM-CMP, 15 slots (12 form + 3 context) in 1460ms |
| LOV baked on-demand | ✓ dutyStation → enum [New York] |
| Context slots injected | ✓ beneficiary, location, author |
| SignalR hub connect (service token) | ✓ live-verified during I-5 |

**Conclusion:** altiora on-demand mode + I-5 invalidation are ready; flip `FLOWDESK_SCHEMA_PROVIDER=altiora` when scaling past the pilot (user decision).
