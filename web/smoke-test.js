"use strict";

const assert = require("node:assert/strict");
const { CASE_STATUSES, DRIVER_STATUS, MOCK_CASES, findCaseByTripId, transitionDriverCase } = require("./mock-cases.js");

assert.equal(MOCK_CASES.length, 4);
assert.ok(MOCK_CASES.every((caseRecord) => CASE_STATUSES.includes(caseRecord.status)));
assert.deepEqual(
  MOCK_CASES.map((caseRecord) => caseRecord.tripId),
  ["trip_demo_001", "trip_demo_002", "trip_demo_003", "trip_demo_004"],
);

const initialCase = findCaseByTripId("trip_demo_001");
const securedCase = transitionDriverCase(initialCase, "secure", "2026-09-22T10:00:00Z", "event_smoke_001");

assert.equal(initialCase.status, "driver_alerted");
assert.equal(securedCase.status, "secured");
assert.equal(DRIVER_STATUS[securedCase.status], "Item secured");
assert.equal(securedCase.auditTimeline.at(-1).eventType, "item_secured");

console.log("TripTrace Phase 0 smoke test passed.");
