# Phase 3 Handoff (Student C → A and B)

The persistent API is ready. The full reference is in [api-contract.md](api-contract.md#phase-3-persistent-api) and [openapi.yaml](openapi.yaml). The Phase 2 `/v1/mock/...` endpoints are unchanged, so the existing screens keep working.

**Student A (upload and case-history UI).** The flow is `POST /v1/trips` → `POST /v1/cases` with `sourceType: "detection"` → `POST /v1/cases/{caseId}/images` with the raw file as the body → `GET /v1/cases/{caseId}` (shows `images[].url`) and `GET /v1/cases/{caseId}/timeline`. The `413` and `415` upload errors return a `message` you can show directly. Show the timeline only on the case-history screen, never on passenger screens. Pairing task: switch one mock flow to these endpoints.

**Student B (staged data).** Upload only images from the frozen staged list. The API stores the bytes exactly as sent and does not strip EXIF. Please review the staged files' metadata (GPS, camera serials, file names) before upload.

# Phase 2 Handoff

## Student A: passenger app

Use `/passenger/` as the public entry point. `TRIP-1001` submits a passenger report and shows only neutral case progress. Refreshing the case after a driver action must not reveal the driver, alert assignment, safe crop, item data, audit records, review code, or any ownership result.

Student A's accepted decisions, baseline verification evidence, and remaining integration checks are recorded in [the Phase 2 plan](../tasks/phase-2-student-a.md). Final integration verification follows the remaining team implementation. Phase 2 operations rules are maintained in [case-states.md](case-states.md); future operations questions remain deferred.

## Student B: driver app

Use `/driver/` as a standalone inbox for one fixed mock driver and vehicle. Do not ask the driver for a Trip ID. Each alert shows its Trip ID, case reference, unread state, approved synthetic crop, category, colour, and `seatAreaHint` using the shared taxonomy.

Driver actions are `secure`, `no_item`, and `ask_operations`. A completed alert disables all actions. Secure means retain the item for operations guidance; it does not permit direct return to a passenger. Poll the inbox for the in-app unread banner only; do not add OS or browser notification prompts.

## Student C: API and transitions

Passenger and driver projections share in-memory cases but use separate endpoints. On the scripted `TRIP-1001` passenger report, append `claim_submitted` then `driver_alerted`, and create an assigned alert only with privacy-approved safe evidence. Evidence that is missing, failed, or incomplete routes the case to `manual_review` with `driver_alert_evidence_unavailable` and creates no alert.

Return a driver projection with only `alertId`, case and trip IDs, time/read/status fields, one safe item crop and summary, allowed actions, and outcome message. Keep all assignment identifiers internal. Reject duplicate actions with `409` after the first accepted action.

The shared status vocabulary remains unchanged. The driver uses `item_secured` for secure, and `manual_review_requested` with `driver_reported_no_item` or `driver_requested_help` for the review paths. A possible-item association is not an ownership determination.
