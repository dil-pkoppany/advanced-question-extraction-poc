# Ticket: Architecture Investigation Spike

## Title

**Decide Orchestration Approach: API Background Task vs Lambda + SNS/SQS + Redis**

---

## Type

Spike / Investigation

## Priority

High

## Labels

- `backend`
- `architecture`
- `spike`

## Parent Ticket

LLM Question Extraction (see `JIRA_LLM_QUESTION_EXTRACTION.md`)

## Depends On

- `TICKET_DB_MIGRATION_AND_MODELS.md` -- for context on the data model
- `TICKET_EXTRACTION_CONFIG.md` -- for context on configuration

---

## Description

Evaluate and decide between two orchestration approaches for the LLM question extraction pipeline (and future auto-answering). The decision gates the Orchestrator implementation and any infrastructure work.

Both options are documented in detail in `ARCHITECTURE.md`. This spike is about making the final call based on the team's operational context, scale expectations, and infrastructure preferences.

### Option A: API Background Task

- All processing runs as an async background task on the existing backend server (ECS/Fargate)
- Throttling via `asyncio.Semaphore`
- No new infrastructure
- Simpler to build and debug

### Option B: Lambda + SNS/SQS + Redis

- Processing is distributed across Lambda functions coordinated by SNS/SQS
- Redis for temporary chunk storage
- Natural horizontal scaling and per-sheet failure isolation
- Aligns with existing survey worker Lambda pattern
- Requires new infrastructure (4 Lambdas, 2 SNS topics, 2 SQS queues, Redis cluster)

---

## What to Evaluate

1. **Current server capacity** -- can the backend handle concurrent background extraction tasks from multiple tenants without resource pressure?
2. **Expected scale** -- how many concurrent extractions and how many tenants in the near term?
3. **Operational preference** -- does the team prefer the existing Lambda pattern or keeping logic in the API?
4. **Infrastructure cost/effort** -- is the overhead of setting up and maintaining Lambda + SNS/SQS + Redis justified?
5. **Bedrock rate limits** -- confirm per-account throttling limits; both approaches are capped to ~10 concurrent calls regardless
6. **Failure isolation needs** -- is per-sheet automatic retry (SQS) important, or is code-level retry sufficient?

---

## Acceptance Criteria

- [ ] Team has reviewed `ARCHITECTURE.md` (Option A vs Option B comparison, timing estimates, pros/cons)
- [ ] Decision is documented (update `ARCHITECTURE.md` Recommendation section with final decision and rationale)
- [ ] If Option B (Lambda): infrastructure tickets are created and estimated
- [ ] If Option A (API): confirm no infrastructure changes needed, proceed to Orchestrator implementation
- [ ] `BIG_PICTURE.md` is updated to reflect the decision (remove "Open" status from Key Decision Points)

---

## Outcome

The spike produces a **go/no-go decision** for Lambda infrastructure. Everything else (DB, models, config, feature flag, async upload, extraction components) is architecture-agnostic and proceeds regardless.

---

## Time Box

3-5 days (including team discussion and documentation update)

---

## Related Documents

- `ARCHITECTURE.md` -- Full comparison of Option A vs Option B with diagrams, timing, and trade-offs
- `BIG_PICTURE.md` -- Ticket dependency diagram showing what is blocked by this spike
- `JIRA_LLM_QUESTION_EXTRACTION.md` -- Parent ticket
- `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` -- Implementation order
