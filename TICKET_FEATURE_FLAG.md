# Ticket: Feature Flag Setup

## Title

**Register Feature Flag and Verify Frontend Flag Endpoint**

---

## Type

Sub-task

## Priority

High

## Labels

- `backend`
- `feature-flag`
- `launchdarkly`

## Parent Ticket

LLM Question Extraction (see `JIRA_LLM_QUESTION_EXTRACTION.md`)

---

## Description

Set up the LaunchDarkly feature flag that controls the LLM question extraction feature, and investigate whether the frontend can already query for feature flag state or if a new endpoint is needed.

### Part 1: Register Feature Flag in LaunchDarkly

Create and configure the `survey_llm_question_extraction` feature flag in LaunchDarkly.

**Flag specification:**

| Property | Value |
|----------|-------|
| Key | `survey_llm_question_extraction` |
| Name | Survey LLM Question Extraction |
| Kind | Boolean |
| Default (OFF) | `false` |
| Default (ON) | `true` |
| Tags | `survey`, `llm`, `backend` |
| Maintainer | Backend team |

**Naming convention rationale** (`{scope}_{feature}`):
- **Scope:** `survey` — affects survey upload and question creation
- **Feature:** `llm_question_extraction` — LLM-based automatic extraction

### Part 2: Verify Frontend Feature Flag Endpoint

Investigate the existing backend API to determine if there is already an endpoint the frontend uses to retrieve feature flag states.

**What to check:**
- Is there an existing endpoint that returns feature flag values to the frontend (e.g., `GET /api/feature-flags`, `GET /api/config`, or similar)?
- If yes: document the endpoint and confirm our new flag will be accessible through it
- If no: document the finding and propose an approach for how the frontend should consume this flag (e.g., direct LaunchDarkly JS SDK, new backend endpoint, or piggyback on an existing response)

This ticket does **not** require implementing a new endpoint — only investigation and documentation.

---

## Acceptance Criteria

### LaunchDarkly Flag Registration

- [ ] Feature flag `survey_llm_question_extraction` is created in LaunchDarkly
- [ ] Flag key follows the `{scope}_{feature}` naming convention
- [ ] Flag is linked to the parent Jira ticket in LaunchDarkly
- [ ] Flag is configured as a boolean flag (true/false)
- [ ] Default variation when OFF: `false`
- [ ] Default variation when ON: `true`
- [ ] Flag supports per-tenant targeting (using tenant context)
- [ ] Flag is tagged with: `survey`, `llm`, `backend`
- [ ] Flag description clearly states: "Controls whether LLM-based question extraction runs automatically on Excel survey upload"
- [ ] Flag is set to OFF in all environments initially

### LaunchDarkly Documentation

- [ ] Flag documented with:
  - Purpose: what the flag controls
  - Scope: which users/systems are affected
  - Jira ticket link
  - Owner: team responsible
  - Rollout plan reference
  - Cleanup date: TBD after GA

### Frontend Flag Endpoint Investigation

- [ ] Documented whether an existing backend endpoint exposes feature flags to the frontend
- [ ] If endpoint exists: confirmed that our flag will be queryable through it
- [ ] If no endpoint exists: proposed approach for frontend flag consumption (document only, do not implement)
- [ ] Findings documented in a brief summary (can be a comment on this ticket or a short section in this file)

### Out of Scope

- Implementing a new feature flag endpoint (if one doesn't exist)
- Backend code to evaluate the flag (will be done in the extraction service ticket)
- Frontend UI changes based on the flag
- Database migrations — see `TICKET_DB_MIGRATION_AND_MODELS.md`
- Configuration file — see `TICKET_EXTRACTION_CONFIG.md`

---

## Technical Notes

- The flag controls two behaviors:
  1. Whether extraction runs automatically on Excel upload
  2. Whether the review workflow is required (can be a variation or separate flag — document recommendation)
- Per-tenant targeting should use the existing tenant context pattern in LaunchDarkly
- The flag should be evaluable from the backend Python service (using the existing LaunchDarkly Python SDK if already integrated)
- If no LaunchDarkly SDK is integrated yet, document what SDK setup is needed

---

## Related Documents

- `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` — Feature Flag section
- `JIRA_LLM_QUESTION_EXTRACTION.md` — Parent Jira ticket (Feature Flag acceptance criteria)
- Workspace Feature Flag Naming Convention (`.cursor/rules`)
