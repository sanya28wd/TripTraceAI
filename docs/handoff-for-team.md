# TripTrace AI Phase 0 Handoff

## Student A frontend mock screens

Use the stable `tripId`, `caseId`, `status`, timestamps, `sourceType`, `privacy`, `detectedItem`, `passengerClaim`, `auditTimeline`, and `manualReviewReason` fields from the contract. Mock screens can use [example-case.json](example-case.json) and the documented endpoints without waiting for implementation. Show safe summaries only; do not show raw cabin imagery, passenger identity, or ownership claims.

## Student B data and GenAI preparation

Provide the proposed item taxonomy, staged-data label fields, privacy-test cases, and future structured GenAI output fields for team review. Keep data synthetic or properly consented and staged. Do not add model outputs or privacy-processing logic in Phase 0. In particular, agree on allowed item categories, colour vocabulary, seat-area vocabulary, sensitive-item handling, and a safe no-item label before later phases.

## Fields that need team agreement before changing

- `tripId`, `caseId`, `status`, `createdAt`, `updatedAt`, and `sourceType`
- The exact eight status values and their spelling
- `privacy.redactionStatus`
- `detectedItem`, `passengerClaim`, `auditTimeline`, and `manualReviewReason`
- Event fields: `eventId`, `eventType`, `occurredAt`, `actorType`, `status`, `note`, and `details`

Student C will maintain the shared contract after agreement from Students A and B.
