# Dialogue Gym

A closed-loop **system-prompt optimizer** for the FlowDesk Chat V2 agent (which
serves both **AltioraChat** (text) and the **voice assistant** — they share one
system prompt). Simulated users (personas) run dialogues against a candidate
prompt in an isolated arena; a multi-criteria judge scores each run against
ratified ground truth; a GEPA reflective-Pareto loop mutates the prompt graph and
proposes improvements for human ratification.

Platform subsystem (CORE namespace). Backend `api/src/services/dialogue-gym/`,
REST `/api/v1/dialogue-gym`, UI at **/dialogue-gym** (ProjectAdvisor frontend).

## Concepts

| Entity | What it is |
|---|---|
| **Persona** | A simulated user with behavioural params (domainKnowledge, patience, verbosity, cooperativeness incl. anti-benevolence, language). Haiku role-plays it. |
| **Scenario** | A test case: userGoal + initialMessage + verifiable `expectedServiceCode` (ratified ground truth) + category/domain/difficulty. |
| **ArenaRun** | One simulated dialogue (persona × scenario × prompt). Records the transcript, deterministic `serviceIdentified`, prompt provenance, and (optional) RU translation. |
| **JudgeRecord** | A multi-criteria evaluation of a run: deterministic `intentAccuracy` + LLM rubric (grounding / tone / controls / helpfulness) → verdict. |
| **OptimizationRun / PromptCandidate** | GEPA bookkeeping: candidates mutated from a baseline, evaluated, Pareto-ranked. |

## The pieces

- **PersonaLibrary + ScenarioBank** — `dialogue-gym.service.js` (CRUD, SUITABLE_FOR, ground-truth ratify). Seed: `scripts/seed-dialogue-gym.js`.
- **ArenaRunner** — `arena-runner.service.js`. Drives persona↔agent through the FlowDesk sandbox (`createSandboxSession`, zero side-effects). Acting identity: token JWT claims → explicit → a **default acting user resolved from the directory (service account)**, so runs work without a per-run token. **Halts** a run only if the directory is genuinely unavailable (a real user always has one).
- **PersonaSimulator** — `persona-simulator.js` (Haiku; respects persona limits, picks offered controls).
- **JudgePanel** — `judge.service.js`. Deterministic intent metric + LLM rubric. Calibrated on a human-labelled golden set before optimization.
- **Prompt bridge** — `prompt-loader.js` loads any CHAT_PROMPT version from the P6 editor; the arena tests it (`promptSource: production | version | custom_text | custom_graph`).
- **GEPA** — `mutation.service.js` (reflect→ops, applied via the editor's applier), `comparison.service.js` (Pareto), `governance.service.js` (SAVE-only, never auto-apply), `gepa-orchestrator.js` (the loop).

## Directory / auth requirement

Every run needs a working user directory (`getCurrentUser` for the beneficiary
self-default; `resolveUser` for name/email lookup) — a run whose directory is
unreachable is halted as `directory_unavailable` because it cannot reflect a real
dialogue.

**Runs work WITHOUT a per-run token.** The employee-directory search and a
**default acting user** are resolved through the **service account** (the same
Altiora credentials the chat already uses), so `getCurrentUser` resolves and the
run proceeds. Override the default with `DIALOGUE_GYM_DEFAULT_USER` (a JSON
identity) or `DIALOGUE_GYM_DEFAULT_USER_EMAIL` (resolved via the directory).

Supply a **bearer token** (`--token` / `DIALOGUE_GYM_ALTIORA_TOKEN` / the UI token
field) only when you need the run to act as a **specific real user** — i.e. their
own scoped view of LOV / MY_REQUESTS / location-scoped catalog. The token is an
Azure AD JWT (~79 min TTL) from the portal (`localStorage.auth_token` or the
Network tab `access_token`); its claims become the acting identity. If a token is
supplied but the directory is genuinely down, the run still aborts
(`directory_unavailable`) — that halt is the guard working, not a regression.

## Typical workflow

```bash
# 0. Seed personas/scenarios (once)
node api/scripts/seed-dialogue-gym.js

# 1. Ratify ground truth (human, one-time; interactive)
node api/scripts/verify-ground-truth.js --by=ivan

# 2. Check the user directory is reachable for the chats
node api/scripts/check-directory.js --token=<jwt>

# 3. Run the golden set (arena + judge), bilingual
DIALOGUE_GYM_ALTIORA_TOKEN=<jwt> node api/scripts/run-golden-set.js --personas=2

# 4. Calibrate the judge (human labels, then Cohen's κ)
node api/scripts/judge-manual.js --pending --by=ivan     # human, interactive
node api/scripts/compute-kappa.js                         # gate: κ ≥ 0.6

# 5. Run one dialogue against a specific prompt version
node api/scripts/run-arena.js --list-prompts
node api/scripts/run-arena.js --persona=new-hr-staff --scenario=leave-balance \
  --prompt-entry=<entryId> --prompt-version=3 --token=<jwt> --translate

# 6. GEPA optimization (after κ ≥ 0.6)
node api/scripts/run-gepa.js --dry-run                    # show the plan
node api/scripts/run-gepa.js --max-iterations=3 --token=<jwt>
```

## UI

- **/dialogue-gym** — Personas, Scenarios (+ ratify), **Arena** (run + version selector + bilingual transcript + judge), Judge.
- The Arena tab's prompt selector (Production / Version / Custom) links to the **Prompt Editor** (`/flowdesk-admin/prompt`); the editor's "Test & apply" panel links back ("Test in Dialogue Gym").

## Governance

Nothing auto-applies. GEPA `approve` **saves** the winning candidate as a new
CHAT_PROMPT version; going live is a separate human "Apply" in the Prompt Editor.
The optimizer proposes; ratification promotes.

## Key REST (`/api/v1/dialogue-gym`)

`personas`, `scenarios` (+ `/:id/verify-ground-truth`), `random-pair`,
`arena/run[-random]`, `arena/runs[/:id[/turns]]`, `judge/run/:id[/human]`,
`judge/records`, `prompts[/production|/:entryId/versions[/:v]]`,
`optimizations[/start|/:id[/stop|/stream|/candidates]]`, `candidates/compare`,
`governance/{request/:id,approve,reject}`.

## Status

Code-complete through GEPA (personas → scenarios → arena → judge → prompt bridge →
UI → GEPA loop). First live GEPA run is gated on judge calibration (κ ≥ 0.6, which
needs the human labelling step above) and a fresh Altiora token.
