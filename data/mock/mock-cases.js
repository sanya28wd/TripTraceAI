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
      category: "bag",
      colour: "blue",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
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
        note: "Synthetic bag candidate recorded."
      },
      {
        eventId: "event_demo_002",
        eventType: "driver_alerted",
        occurredAt: "2026-09-22T06:02:00Z",
        actorType: "system",
        status: "driver_alerted",
        note: "Safe item summary sent to driver."
      }
    ]
  },

  {
    caseId: "case_demo_002",
    tripId: "trip_demo_002",
    status: "clarification_needed",
    createdAt: "2026-09-26T10:05:00Z",
    updatedAt: "2026-09-26T10:05:00Z",
    sourceType: "passenger_app",
    privacy: {
      redactionStatus: "complete"
    },
    detectedItem: {
      category: "headphones",
      colour: "black",
      seatAreaHint: "rear_seat",
      confidence: 0.74,
      boundingBox: [150, 200, 260, 290],
      noItem: false,
      modelVersion: "yolov8-mock-v1"
    },
    passengerClaim: {
      description: "أعتقد أنني تركت سماعات الرأس السوداء في السيارة.",
      category: "headphones",
      colour: "black",
      sizeHint: "small",
      language: "ar",
      sensitive: false,
      missingDetails: ["seat_area"]
    },
    manualReviewReason: null,
    auditTimeline: []
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
      category: "passport",
      colour: "unknown",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "Synthetic travel document",
      category: "passport",
      colour: "unknown",
      sizeHint: "small",
      language: "en",
      sensitive: true
    },
    manualReviewReason: "sensitive_item",
    auditTimeline: [
      {
        eventId: "event_demo_030",
        eventType: "item_secured",
        occurredAt: "2026-09-22T08:08:00Z",
        actorType: "driver",
        status: "secured",
        note: "Driver confirmed the item is secure."
      },
      {
        eventId: "event_demo_031",
        eventType: "manual_review_requested",
        occurredAt: "2026-09-22T08:12:00Z",
        actorType: "system",
        status: "manual_review",
        note: "Sensitive synthetic claim routed to operations."
      }
    ]
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
      category: "umbrella",
      colour: "red",
      sizeHint: "medium",
      language: "en",
      sensitive: false
    },
    manualReviewReason: "claim_without_detection",
    auditTimeline: [
      {
        eventId: "event_demo_040",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T09:00:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Synthetic claim created without a detected case."
      },
      {
        eventId: "event_demo_041",
        eventType: "manual_review_requested",
        occurredAt: "2026-09-22T09:01:00Z",
        actorType: "system",
        status: "manual_review",
        note: "Claim without a detection routed to operations."
      }
    ]
  },

  {
    caseId: "case_demo_005",
    tripId: "trip_demo_005",
    status: "claim_submitted",
    createdAt: "2026-09-22T10:00:00Z",
    updatedAt: "2026-09-22T10:01:00Z",
    sourceType: "passenger_claim",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "phone",
      colour: "black",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "هاتف أسود، أعتقد أنني تركته على المقعد الخلفي.",
      category: "phone",
      colour: "black",
      sizeHint: "small",
      language: "ar",
      sensitive: false
    },
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_050",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T10:01:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Synthetic Arabic phone claim submitted."
      }
    ]
  },

  {
    caseId: "case_demo_006",
    tripId: "trip_demo_006",
    status: "claim_submitted",
    createdAt: "2026-09-22T11:00:00Z",
    updatedAt: "2026-09-22T11:02:00Z",
    sourceType: "passenger_claim",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "backpack",
      colour: "blue",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "تركت حقيبتي الزرقاء في المقعد الخلفي.",
      category: "backpack",
      colour: "blue",
      sizeHint: "medium",
      language: "ar",
      sensitive: false
    },
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_060",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T11:02:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Synthetic Arabic backpack claim submitted."
      }
    ]
  },

  {
    caseId: "case_demo_007",
    tripId: "trip_demo_007",
    status: "clarification_needed",
    createdAt: "2026-09-22T12:00:00Z",
    updatedAt: "2026-09-22T12:05:00Z",
    sourceType: "passenger_claim",
    privacy: { redactionStatus: "passed" },
    detectedItem: null,
    passengerClaim: {
      description: "أعتقد أنني تركت شيئًا في السيارة.",
      category: "unknown",
      colour: "unknown",
      sizeHint: "unknown",
      language: "ar",
      sensitive: false
    },
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_070",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T12:00:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Claim does not contain enough safe identifying details."
      },
      {
        eventId: "event_demo_071",
        eventType: "clarification_requested",
        occurredAt: "2026-09-22T12:05:00Z",
        actorType: "system",
        status: "clarification_needed",
        note: "Passenger asked for another safe description."
      }
    ]
  },

  {
    caseId: "case_demo_008",
    tripId: "trip_demo_008",
    status: "clarification_needed",
    createdAt: "2026-09-22T13:00:00Z",
    updatedAt: "2026-09-22T13:05:00Z",
    sourceType: "passenger_claim",
    privacy: { redactionStatus: "passed" },
    detectedItem: null,
    passengerClaim: {
      description: "أعتقد أنني تركت شيئًا في السيارة.",
      category: "unknown",
      colour: "unknown",
      sizeHint: "unknown",
      language: "ar",
      sensitive: false
    },
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_080",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T13:00:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Synthetic Arabic claim lacks sufficient item details."
      },
      {
        eventId: "event_demo_081",
        eventType: "clarification_requested",
        occurredAt: "2026-09-22T13:05:00Z",
        actorType: "system",
        status: "clarification_needed",
        note: "Passenger asked for another safe description."
      }
    ]
  },

  {
    caseId: "case_demo_009",
    tripId: "trip_demo_009",
    status: "matched",
    createdAt: "2026-09-22T14:00:00Z",
    updatedAt: "2026-09-22T14:10:00Z",
    sourceType: "detection",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "wallet",
      colour: "brown",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "محفظة بنية تركتها على المقعد الخلفي.",
      category: "wallet",
      colour: "brown",
      sizeHint: "small",
      language: "ar",
      sensitive: false
    },
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_090",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T14:05:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Synthetic Arabic wallet claim submitted."
      },
      {
        eventId: "event_demo_091",
        eventType: "match_found",
        occurredAt: "2026-09-22T14:10:00Z",
        actorType: "system",
        status: "matched",
        note: "Possible match found from structured evidence."
      }
    ]
  },

  {
    caseId: "case_demo_010",
    tripId: "trip_demo_010",
    status: "matched",
    createdAt: "2026-09-22T15:00:00Z",
    updatedAt: "2026-09-22T15:10:00Z",
    sourceType: "detection",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "earbuds",
      colour: "white",
      seatAreaHint: "rear_floor",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "تركت سماعات أذن بيضاء في السيارة.",
      category: "earbuds",
      colour: "white",
      sizeHint: "small",
      language: "ar",
      sensitive: false
    },
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_100",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T15:05:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Synthetic Arabic earbuds claim submitted."
      },
      {
        eventId: "event_demo_101",
        eventType: "match_found",
        occurredAt: "2026-09-22T15:10:00Z",
        actorType: "system",
        status: "matched",
        note: "Possible match found from structured evidence."
      }
    ]
  },

  {
    caseId: "case_demo_011",
    tripId: "trip_demo_011",
    status: "manual_review",
    createdAt: "2026-09-22T16:00:00Z",
    updatedAt: "2026-09-22T16:05:00Z",
    sourceType: "passenger_claim",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "medication",
      colour: "unknown",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "نسيت دوائي في السيارة.",
      category: "medication",
      colour: "unknown",
      sizeHint: "small",
      language: "ar",
      sensitive: true
    },
    manualReviewReason: "sensitive_item",
    auditTimeline: [
      {
        eventId: "event_demo_110",
        eventType: "manual_review_requested",
        occurredAt: "2026-09-22T16:05:00Z",
        actorType: "system",
        status: "manual_review",
        note: "Sensitive synthetic medication claim routed to operations."
      }
    ]
  },

  {
    caseId: "case_demo_012",
    tripId: "trip_demo_012",
    status: "manual_review",
    createdAt: "2026-09-22T17:00:00Z",
    updatedAt: "2026-09-22T17:05:00Z",
    sourceType: "passenger_claim",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "phone",
      colour: "black",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "My phone was left somewhere in the car, but I am not sure where.",
      category: "phone",
      colour: "unknown",
      sizeHint: "small",
      language: "en",
      sensitive: false
    },
    manualReviewReason: "low_confidence",
    auditTimeline: [
      {
        eventId: "event_demo_120",
        eventType: "manual_review_requested",
        occurredAt: "2026-09-22T17:05:00Z",
        actorType: "system",
        status: "manual_review",
        note: "Low-confidence synthetic case routed to review."
      }
    ]
  },

  {
    caseId: "case_demo_013",
    tripId: "trip_demo_013",
    status: "manual_review",
    createdAt: "2026-09-22T18:00:00Z",
    updatedAt: "2026-09-22T18:03:00Z",
    sourceType: "detection",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "unknown",
      colour: "unknown",
      seatAreaHint: "unknown",
      confidence: null,
      boundingBox: null,
      noItem: true,
      modelVersion: null
    },
    passengerClaim: {
      description: "I left a small bag in the car.",
      category: "bag",
      colour: "unknown",
      sizeHint: "small",
      language: "en",
      sensitive: false
    },
    manualReviewReason: "driver_reported_no_item",
    auditTimeline: [
      {
        eventId: "event_demo_130",
        eventType: "no_item_detected",
        occurredAt: "2026-09-22T18:02:00Z",
        actorType: "system",
        status: "detected",
        note: "Synthetic no-item result recorded."
      },
      {
        eventId: "event_demo_131",
        eventType: "manual_review_requested",
        occurredAt: "2026-09-22T18:03:00Z",
        actorType: "system",
        status: "manual_review",
        note: "No-item result requires further review."
      }
    ]
  },

  {
    caseId: "case_demo_014",
    tripId: "trip_demo_014",
    status: "driver_alerted",
    createdAt: "2026-09-22T19:00:00Z",
    updatedAt: "2026-09-22T19:02:00Z",
    sourceType: "detection",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "sunglasses",
      colour: "black",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "تركت نظارتي الشمسية السوداء في المقعد الخلفي.",
      category: "sunglasses",
      colour: "black",
      sizeHint: "small",
      language: "ar",
      sensitive: false
    },
    manualReviewReason: null,
    auditTimeline: [
      {
        eventId: "event_demo_140",
        eventType: "driver_alerted",
        occurredAt: "2026-09-22T19:02:00Z",
        actorType: "system",
        status: "driver_alerted",
        note: "Safe item summary sent to driver."
      }
    ]
  },

  {
    caseId: "case_demo_015",
    tripId: "trip_demo_015",
    status: "manual_review",
    createdAt: "2026-09-22T20:00:00Z",
    updatedAt: "2026-09-22T20:04:00Z",
    sourceType: "passenger_claim",
    privacy: { redactionStatus: "passed" },
    detectedItem: {
      category: "bag",
      colour: "black",
      seatAreaHint: "rear_seat",
      confidence: null,
      boundingBox: null,
      noItem: false,
      modelVersion: null
    },
    passengerClaim: {
      description: "My bag is black, but the detected item appears different.",
      category: "bag",
      colour: "black",
      sizeHint: "large",
      language: "en",
      sensitive: false
    },
    manualReviewReason: "conflicting_claim",
    auditTimeline: [
      {
        eventId: "event_demo_150",
        eventType: "claim_submitted",
        occurredAt: "2026-09-22T20:02:00Z",
        actorType: "passenger",
        status: "claim_submitted",
        note: "Synthetic claim conflicts with detected evidence."
      },
      {
        eventId: "event_demo_151",
        eventType: "manual_review_requested",
        occurredAt: "2026-09-22T20:04:00Z",
        actorType: "system",
        status: "manual_review",
        note: "Conflicting evidence routed to operations."
      }
    ]
  }
]);
