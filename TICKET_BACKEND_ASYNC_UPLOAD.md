# Ticket: Backend Async Survey Upload

## Title

**Return Extraction Pending Status on Survey Upload**

---

## Type

Sub-task

## Priority

High

## Labels

- `backend`
- `api`

## Parent Ticket

LLM Question Extraction (see `JIRA_LLM_QUESTION_EXTRACTION.md`)

## Depends On

- `TICKET_FEATURE_FLAG.md` -- the feature flag must exist so the backend can check if LLM extraction is enabled

---

## Description

When the `survey_llm_question_extraction` feature flag is enabled for the tenant, the upload endpoint should create the survey DB record with `extraction_status = 'pending'` and return immediately with the survey ID and status. This allows the frontend to close the upload modal and show the survey in the list without waiting for extraction to complete.

When the feature flag is **disabled**, the existing synchronous upload flow is used (no behavior change).

### What to Implement

1. On `POST /surveys/upload`, check the `survey_llm_question_extraction` feature flag for the current tenant
2. If **enabled**:
   - Save the uploaded file
   - Create the survey record with `extraction_status = 'pending'`
   - Return `202 Accepted` with `{ survey_id, extraction_status: "pending" }`
   - Kick off the background extraction task (sets status to `in_progress`, then `completed`/`failed`/`partial`)
3. If **disabled**:
   - Use the existing synchronous upload logic (no change)

---

## Acceptance Criteria

- [ ] Upload endpoint checks `survey_llm_question_extraction` feature flag
- [ ] When flag is enabled: survey is created with `extraction_status = 'pending'`, response is `202 Accepted`
- [ ] When flag is enabled: background extraction task is triggered after the response is sent
- [ ] When flag is disabled: existing synchronous upload flow is unchanged
- [ ] Response includes `survey_id` and `extraction_status` so the frontend can act on it
- [ ] Error handling: if survey creation fails, return appropriate error (no orphaned records)

---

## Out of Scope

- Extraction logic itself (separate ticket)
- Frontend changes (see `TICKET_FRONTEND_ASYNC_UPLOAD.md`)
- Status polling endpoint (Phase 1 ticket)
- Auto-answering (Phase 2)

---

## Related Documents

- `TICKET_FEATURE_FLAG.md` -- Feature flag this depends on
- `TICKET_FRONTEND_ASYNC_UPLOAD.md` -- Frontend counterpart
- `ARCHITECTURE.md` -- Architecture decision and error handling
- `JIRA_LLM_QUESTION_EXTRACTION.md` -- Parent ticket
