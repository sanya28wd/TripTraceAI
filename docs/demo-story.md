# Phase 2 Demo Story

Use synthetic Trip IDs only. The passenger and driver prototypes share a mock case held in API memory; the state resets when the API restarts.

## Passenger report to driver action

1. Open the passenger journey and enter `TRIP-1001`.
2. Submit a synthetic black-bag report. The passenger receives a neutral review message. The case records `claim_submitted`, then moves to `driver_alerted` for the scripted possible-item association.
3. Open `/driver/`. The demo driver inbox receives one unread alert automatically. It shows `TRIP-1001`, `CASE-MOCK-1001`, a privacy-approved synthetic black-bag crop, and the safe summary: bag, black, right seat. It does not show claim wording, passenger identity, raw cabin imagery, or detector internals.
4. Select **Secure item**. The case moves to `secured`; the driver sees that operations will provide next steps. The passenger can select **Check latest status** to see neutral review progress. This flow does not decide ownership or authorize a handover.

## Driver follow-up alternatives

From a fresh API run, submit the same sample passenger report, then choose **No item found** or **Ask operations for help** in the driver journey. Either action moves the case to `manual_review` and records its distinct review reason and audit event. The passenger sees a neutral review message.

## Other passenger paths

`TRIP-1002` demonstrates clarification and does not create a driver alert. `TRIP-1003` demonstrates Arabic sensitive-item review; it remains with operations. Neither path shows detected-item evidence to the passenger.
