"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  alertDriverAfterClaim,
  createDriverAlert,
  driverAlertView,
  hasSafeDriverEvidence,
  passengerCaseView,
  routeCaseToOperations,
  transitionDriverCase,
} = require("../api/src/server.js");

const fixturePath = path.join(__dirname, "..", "api", "mock-data", "cases.json");
const mockCases = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const demoCase = mockCases.find((mockCase) => mockCase.tripId === "TRIP-1001");

assert.ok(demoCase, "TRIP-1001 must be present.");
assert.equal(hasSafeDriverEvidence(demoCase), true);

const passengerBeforeAlert = passengerCaseView(demoCase);
assert.equal("detectedItem" in passengerBeforeAlert, false);
assert.equal("claim" in passengerBeforeAlert, false);
assert.equal("auditTimeline" in passengerBeforeAlert, false);

const alertedCase = alertDriverAfterClaim(demoCase, "2026-10-01T12:00:00.000Z", "EVENT-SMOKE-ALERT");
assert.equal(demoCase.status, "detected", "The source fixture must remain unchanged.");
assert.equal(alertedCase.status, "driver_alerted");
assert.equal(alertedCase.auditTimeline.at(-1).eventType, "driver_alerted");

const driverAlert = createDriverAlert(alertedCase, "2026-10-01T12:00:00.000Z");
const driverView = driverAlertView(driverAlert);
assert.deepEqual(driverView.detectedItem, {
  category: "bag",
  colour: "black",
  seatAreaHint: "right_seat",
  imageUrl: "/assets/mock/black-bag-safe-crop.png",
  imageAlt: "Synthetic close crop of a plain black shoulder bag on a blurred fabric seat.",
});
assert.equal("assignedDriverId" in driverView, false);
assert.equal("confidence" in driverView.detectedItem, false);
assert.equal("boundingBox" in driverView.detectedItem, false);
assert.equal("claim" in driverView, false);

const securedCase = transitionDriverCase(alertedCase, "secure", "2026-10-01T12:01:00.000Z", "EVENT-SMOKE-SECURE");
assert.equal(securedCase.status, "secured");
assert.equal(securedCase.auditTimeline.at(-1).eventType, "item_secured");

const missingEvidenceCase = structuredClone(demoCase);
missingEvidenceCase.detectedItem.image.privacyStatus = "failed";
assert.equal(hasSafeDriverEvidence(missingEvidenceCase), false);
const reviewCase = routeCaseToOperations(missingEvidenceCase, "2026-10-01T12:00:00.000Z", "EVENT-SMOKE-REVIEW");
assert.equal(reviewCase.status, "manual_review");
assert.equal(reviewCase.manualReviewReason, "driver_alert_evidence_unavailable");
assert.equal(reviewCase.auditTimeline.at(-1).eventType, "manual_review_requested");

console.log("TripTrace web smoke test passed.");
