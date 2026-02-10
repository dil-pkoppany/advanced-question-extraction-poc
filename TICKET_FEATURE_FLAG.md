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

Set up the feature flag that controls the LLM question extraction feature in AppSettings, and investigate whether the frontend can already query for feature flag state or if a new endpoint is needed.

### Part 1: Register Feature Flag

Create and configure the survey_llm_question_extraction feature flag in AppSettings.

### Part 2: Verify Frontend Feature Flag Endpoint

Investigate the existing backend API to determine if there is already an endpoint the frontend uses to retrieve feature flag states.

**What to check:**
- Is there an existing endpoint that returns feature flag values to the frontend (e.g., `GET /api/feature-flags`, `GET /api/config`, or similar)?
- If yes: nothing to do
- If no: implement it


---

## Acceptance Criteria

### LaunchDarkly Flag Registration

- [ ] Feature flag `survey_llm_question_extraction` is created
- [ ] Endpoint is verified and working