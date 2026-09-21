"use strict";

const CASE_STATUSES = Object.freeze([
  "detected",
  "claim_submitted",
  "clarification_needed",
  "matched",
  "driver_alerted",
  "secured",
  "manual_review",
  "closed",
]);

const PASSENGER_STATUS = Object.freeze({
  detected: ["Under review", "We are checking your report."],
  driver_alerted: ["Under review", "The case is still being checked."],
  secured: ["Under review", "The case is still being checked."],
  claim_submitted: ["Claim received", "We will update this case after review."],
  clarification_needed: ["More details needed", "Add another safe description to help the review."],
  matched: ["Possible match under review", "The team must complete its checks."],
  manual_review: ["Being reviewed by our team", "No action is needed unless the team asks for details."],
  closed: ["Case closed", "The review for this case has ended."],
});

const DRIVER_STATUS = Object.freeze({
  secured: "Item secured",
  manual_review: "Operations review needed",
});

const DRIVER_ACTIONS = Object.freeze({
  secure: Object.freeze({
    status: "secured",
    eventType: "item_secured",
    note: "Driver confirmed the item is secure.",
    manualReviewReason: null,
  }),
  no_item: Object.freeze({
    status: "manual_review",
    eventType: "manual_review_requested",
    note: "Driver reported that no item was found.",
    manualReviewReason: "driver_reported_no_item",
  }),
  ask_operations: Object.freeze({
    status: "manual_review",
    eventType: "manual_review_requested",
    note: "Driver asked operations for help.",
    manualReviewReason: "driver_requested_help",
  }),
});

const MOCK_CASES = Object.freeze([
  {
    caseId: "case_demo_001",
    tripId: "trip_demo_001",
    status: "driver_alerted",
    createdAt: "2026-09-22T06:00:00Z",
    updatedAt: "2026-09-22T06:02:00Z",
    sourceType: "detection",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "placeholder_bag",
      colour: "placeholder_blue",
      seatAreaHint: "placeholder_rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null,
    },
    passengerClaim: null,
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_001",
        eventType: "case_created",
        occurredAt: "2026-09-22T06:00:00Z",
        actorType: "system",
        status: "detected",
        note: "Synthetic bag candidate recorded.",
      },
      {
        eventId: "event_demo_002",
        eventType: "driver_alerted",
        occurredAt: "2026-09-22T06:02:00Z",
        actorType: "system",
        status: "driver_alerted",
        note: "Safe item summary sent to driver.",
      },
    ],
  },
  {
    caseId: "case_demo_002",
    tripId: "trip_demo_002",
    status: "clarification_needed",
    createdAt: "2026-09-22T07:00:00Z",
    updatedAt: "2026-09-22T07:15:00Z",
    sourceType: "detection",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "placeholder_headphones",
      colour: "placeholder_black",
      seatAreaHint: "placeholder_rear_floor",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null,
    },
    passengerClaim: {
      description: "Synthetic headphones",
      category: "placeholder_headphones",
      colour: "placeholder_unknown",
      sizeHint: "placeholder_small",
      language: "en",
      sensitive: false,
    },
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_020",
        eventType: "clarification_requested",
        occurredAt: "2026-09-22T07:15:00Z",
        actorType: "system",
        status: "clarification_needed",
        note: "Another safe description is needed.",
      },
    ],
  },
  {
    caseId: "case_demo_003",
    tripId: "trip_demo_003",
    status: "manual_review",
    createdAt: "2026-09-22T08:00:00Z",
    updatedAt: "2026-09-22T08:12:00Z",
    sourceType: "detection",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "placeholder_passport",
      colour: "placeholder_unknown",
      seatAreaHint: "placeholder_rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null,
    },
    passengerClaim: {
      description: "Synthetic travel document",
      category: "placeholder_passport",
      colour: "placeholder_unknown",
      sizeHint: "placeholder_small",
      language: "en",
      sensitive: true,
    },
    manualReviewReason: "sensitive_item",
    auditTimeline: [
      {
        eventId: "event_demo_030",
        eventType: "item_secured",
        occurredAt: "2026-09-22T08:08:00Z",
        actorType: "driver",
        status: "secured",
        note: "Driver confirmed the item is secure.",
      },
      {
        eventId: "event_demo_031",
        eventType: "manual_review_requested",
        occurredAt: "2026-09-22T08:12:00Z",
        actorType: "system",
        status: "manual_review",
        note: "Sensitive synthetic claim routed to operations.",
      },
    ],
  },
  {
    caseId: "case_demo_004",
    tripId: "trip_demo_004",
    status: "manual_review",
    createdAt: "2026-09-22T09:00:00Z",
    updatedAt: "2026-09-22T09:01:00Z",
    sourceType: "passenger_claim",
    privacy: { redactionStatus: "not_applicable" },
    detectedItem: null,
    passengerClaim: {
      description: "Synthetic red umbrella",
      category: "placeholder_umbrella",
      colour: "placeholder_red",
      sizeHint: "placeholder_medium",
      language: "en",
      sensitive: false,
    },
    manualReviewReason: "claim_without_detection",
    auditTimeline: [
      {
        eventId: "event_demo_040",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T09:00:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Synthetic claim created without a detected case.",
      },
      {
        eventId: "event_demo_041",
        eventType: "manual_review_requested",
        occurredAt: "2026-09-22T09:01:00Z",
        actorType: "system",
        status: "manual_review",
        note: "Claim without a detection routed to operations.",
      },
    ],
  },
]);

const findCaseByTripId = (tripId) => {
  const caseRecord = MOCK_CASES.find((candidate) => candidate.tripId === tripId);
  return caseRecord === undefined ? null : structuredClone(caseRecord);
};

const transitionDriverCase = (caseRecord, action, occurredAt, eventId) => {
  if (caseRecord.status !== "driver_alerted") {
    throw new Error(`Case ${caseRecord.caseId} cannot accept a driver action from status ${caseRecord.status}.`);
  }

  const transition = DRIVER_ACTIONS[action];
  if (transition === undefined) {
    throw new RangeError(`Unknown driver action: ${action}.`);
  }

  const event = {
    eventId,
    eventType: transition.eventType,
    occurredAt,
    actorType: "driver",
    status: transition.status,
    note: transition.note,
  };

  return {
    ...caseRecord,
    status: transition.status,
    updatedAt: occurredAt,
    manualReviewReason: transition.manualReviewReason,
    auditTimeline: [...caseRecord.auditTimeline, event],
  };
};

const TripTrace = Object.freeze({
  CASE_STATUSES,
  DRIVER_STATUS,
  MOCK_CASES,
  PASSENGER_STATUS,
  findCaseByTripId,
  transitionDriverCase,
});

if (typeof module === "object") {
  module.exports = TripTrace;
}
