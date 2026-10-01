# Phase 2 Handoff

## Student A: passenger app

Use `/passenger/` as the public entry point. `TRIP-1001` submits a passenger report and shows only neutral case progress. Refreshing the case after a driver action must not reveal the driver, alert assignment, safe crop, item data, audit records, review code, or any ownership result.

## Student B: driver app

Use `/driver/` as a standalone inbox for one fixed mock driver and vehicle. Do not ask the driver for a Trip ID. Each alert shows its Trip ID, case reference, unread state, approved synthetic crop, category, colour, and `seatAreaHint` using the shared taxonomy.

Driver actions are `secure`, `no_item`, and `ask_operations`. A completed alert disables all actions. Secure means retain the item for operations guidance; it does not permit direct return to a passenger. Poll the inbox for the in-app unread banner only; do not add OS or browser notification prompts.

## Student C: API and transitions

Passenger and driver projections share in-memory cases but use separate endpoints. On the scripted `TRIP-1001` passenger report, append `claim_submitted` then `driver_alerted`, and create an assigned alert only with privacy-approved safe evidence. Evidence that is missing, failed, or incomplete routes the case to `manual_review` with `driver_alert_evidence_unavailable` and creates no alert.

Return a driver projection with only `alertId`, case and trip IDs, time/read/status fields, one safe item crop and summary, allowed actions, and outcome message. Keep all assignment identifiers internal. Reject duplicate actions with `409` after the first accepted action.

The shared status vocabulary remains unchanged. The driver uses `item_secured` for secure, and `manual_review_requested` with `driver_reported_no_item` or `driver_requested_help` for the review paths. A possible-item association is not an ownership determination.
