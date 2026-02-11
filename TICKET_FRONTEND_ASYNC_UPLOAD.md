# Ticket: Frontend Async Survey Upload

## Title

**Show Survey with Pending Status After Upload**

---

## Type

Sub-task

## Priority

High

## Labels

- `frontend`
- `ui`

## Parent Ticket

LLM Question Extraction (see `JIRA_LLM_QUESTION_EXTRACTION.md`)

## Depends On

- `TICKET_FEATURE_FLAG.md` -- the feature flag must be available to the frontend
- `TICKET_BACKEND_ASYNC_UPLOAD.md` -- the backend must return the new `202 Accepted` response

---

## Description

When the `survey_llm_question_extraction` feature flag is enabled, the frontend should handle the new async upload flow: close the upload modal immediately after receiving `202 Accepted`, add the survey to the list with a visible "Extraction Pending" status, and poll for status updates.

When the feature flag is **disabled**, the existing synchronous upload flow is used (no behavior change).

### What to Implement

1. After uploading, check the response status code:
   - `202 Accepted` (flag enabled): close the upload modal, add the survey to the survey list table with the extraction status from the response
   - `200 OK` (flag disabled): use the existing synchronous behavior
2. Show the extraction status in the survey list table (e.g., "Pending", "Extracting...", "Completed", "Failed")
3. Poll `GET /surveys/{survey_id}/extraction/status` while status is `pending` or `in_progress`
4. Stop polling on terminal status (`completed`, `failed`, `partial`) or after frontend max poll timeout

---

## Acceptance Criteria

- [ ] Upload modal closes immediately on `202 Accepted` response
- [ ] Survey appears in the survey list table with extraction status indicator
- [ ] Status indicator updates as polling returns new statuses (`pending` -> `in_progress` -> `completed`)
- [ ] On `failed` status: show error message and retry option
- [ ] On `partial` status: show warning and allow user to proceed to review
- [ ] When feature flag is disabled: existing synchronous upload behavior is unchanged
- [ ] Frontend stops polling after max timeout (20 min) and shows a timeout message

---

## Out of Scope

- Backend upload changes (see `TICKET_BACKEND_ASYNC_UPLOAD.md`)
- Review page for extracted questions (separate ticket)
- Auto-answering status display (Phase 2)

---

## Related Documents

- `TICKET_BACKEND_ASYNC_UPLOAD.md` -- Backend counterpart
- `TICKET_FEATURE_FLAG.md` -- Feature flag this depends on
- `ARCHITECTURE.md` -- Frontend polling rules and error handling
- `JIRA_LLM_QUESTION_EXTRACTION.md` -- Parent ticket
