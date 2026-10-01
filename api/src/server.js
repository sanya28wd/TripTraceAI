"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? "0.0.0.0";
const mockCasesPath = path.join(__dirname, "..", "mock-data", "cases.json");

/** @typedef {"detected" | "claim_submitted" | "clarification_needed" | "matched" | "driver_alerted" | "secured" | "manual_review" | "closed"} CaseStatus */
/** @typedef {"secure" | "no_item" | "ask_operations"} DriverAction */
/** @typedef {"new" | "in_progress" | "completed"} AlertStatus */
/** @typedef {{imageUrl: string, imageAlt: string, privacyStatus: "passed" | "failed" | "pending", crop: {width: number, height: number}}} SafeItemImage */
/** @typedef {{category: string, colour: string, seatAreaHint: string, confidence: number|null, boundingBox: object|null, noItem: boolean, modelVersion: string|null, image?: SafeItemImage}} DetectedItem */
/**
 * @typedef {object} MockCase
 * @property {string} tripId
 * @property {string} caseId
 * @property {CaseStatus} status
 * @property {"en" | "ar"} language
 * @property {{category: string, colour: string|null, passengerWording: string}} [claim]
 * @property {DetectedItem|null} [detectedItem]
 * @property {"safe_status" | "clarification" | "manual_review"} responseType
 * @property {string} safePassengerMessage
 * @property {string|null} clarificationQuestion
 * @property {string|null} manualReviewReason
 * @property {Array<{eventId: string, eventType: string, occurredAt: string, actorType: string, note: string, status?: CaseStatus}>} auditTimeline
 * @property {string} [updatedAt]
 */
/**
 * @typedef {object} MockAlert
 * @property {string} alertId
 * @property {string} caseId
 * @property {string} tripId
 * @property {string} assignedDriverId
 * @property {string} assignedVehicleId
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} readAt
 * @property {AlertStatus} alertStatus
 * @property {CaseStatus} caseStatus
 * @property {{category: string, colour: string, seatAreaHint: string, imageUrl: string, imageAlt: string}} detectedItem
 * @property {DriverAction[]} allowedActions
 * @property {string|null} outcomeMessage
 */

const demoDriver = Object.freeze({ driverId: "DRIVER-MOCK-001", name: "Demo Driver" });
const demoVehicle = Object.freeze({ vehicleId: "VEHICLE-MOCK-204", label: "Vehicle DXB-204" });
const driverActions = Object.freeze(["secure", "no_item", "ask_operations"]);

/** @returns {MockCase[]} */
const loadMockCases = () => {
  const fileContents = fs.readFileSync(mockCasesPath, "utf8");
  /** @type {MockCase[]} */
  const mockCases = JSON.parse(fileContents);
  return mockCases;
};

/** @param {http.ServerResponse} response @param {number} statusCode @param {unknown} payload */
const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

/** @param {http.IncomingMessage} request @returns {Promise<unknown>} */
const readJsonBody = (request) => new Promise((resolve, reject) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    if (body.length === 0) {
      resolve({});
      return;
    }
    try {
      resolve(JSON.parse(body));
    } catch {
      reject(new Error("Request body must be valid JSON."));
    }
  });
  request.on("error", reject);
});

/** @param {unknown} value @returns {value is {tripId: string, description?: string, language?: string}} */
const isClaimRequest = (value) => typeof value === "object" && value !== null
  && "tripId" in value && typeof value.tripId === "string";

/** @param {unknown} value @returns {value is {action: DriverAction}} */
const isDriverActionRequest = (value) => typeof value === "object" && value !== null
  && "action" in value && typeof value.action === "string" && driverActions.includes(value.action);

/** @param {MockCase} mockCase @returns {Record<string, unknown>} */
const passengerCaseView = (mockCase) => ({
  tripId: mockCase.tripId,
  caseId: mockCase.caseId,
  status: mockCase.status,
  language: mockCase.language,
  responseType: mockCase.responseType,
  safePassengerMessage: passengerMessage(mockCase.status, mockCase.safePassengerMessage),
  clarificationQuestion: mockCase.clarificationQuestion,
});

/** @param {CaseStatus} status @param {string} defaultMessage @returns {string} */
const passengerMessage = (status, defaultMessage) => {
  if (status === "driver_alerted" || status === "secured") {
    return "Your report is being reviewed. We will share next steps when available.";
  }
  if (status === "manual_review") {
    return "Your report has been sent for review. No action is needed unless our team contacts you.";
  }
  return defaultMessage;
};

/** @param {MockCase} mockCase @returns {mockCase is MockCase & {detectedItem: DetectedItem & {image: SafeItemImage}}} */
const hasSafeDriverEvidence = (mockCase) => mockCase.detectedItem !== null
  && mockCase.detectedItem !== undefined
  && mockCase.detectedItem.noItem === false
  && mockCase.detectedItem.image !== undefined
  && mockCase.detectedItem.image.privacyStatus === "passed";

/** @param {MockCase} mockCase @param {string} occurredAt @param {string} eventId @returns {MockCase} */
const routeCaseToOperations = (mockCase, occurredAt, eventId) => ({
  ...mockCase,
  status: "manual_review",
  updatedAt: occurredAt,
  manualReviewReason: "driver_alert_evidence_unavailable",
  auditTimeline: [...mockCase.auditTimeline, {
    eventId,
    eventType: "manual_review_requested",
    occurredAt,
    actorType: "system",
    status: "manual_review",
    note: "Driver alert was not created because safe item evidence is unavailable.",
  }],
});

/** @param {MockCase & {detectedItem: DetectedItem & {image: SafeItemImage}}} mockCase @param {string} occurredAt @returns {MockAlert} */
const createDriverAlert = (mockCase, occurredAt) => ({
  alertId: `ALERT-MOCK-${randomUUID()}`,
  caseId: mockCase.caseId,
  tripId: mockCase.tripId,
  assignedDriverId: demoDriver.driverId,
  assignedVehicleId: demoVehicle.vehicleId,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  readAt: null,
  alertStatus: "new",
  caseStatus: "driver_alerted",
  detectedItem: {
    category: mockCase.detectedItem.category,
    colour: mockCase.detectedItem.colour,
    seatAreaHint: mockCase.detectedItem.seatAreaHint,
    imageUrl: mockCase.detectedItem.image.imageUrl,
    imageAlt: mockCase.detectedItem.image.imageAlt,
  },
  allowedActions: [...driverActions],
  outcomeMessage: null,
});

/** @param {MockCase} mockCase @param {string} occurredAt @param {string} eventId @returns {MockCase} */
const alertDriverAfterClaim = (mockCase, occurredAt, eventId) => ({
  ...mockCase,
  status: "driver_alerted",
  updatedAt: occurredAt,
  manualReviewReason: null,
  auditTimeline: [...mockCase.auditTimeline,
    { eventId: `${eventId}-claim`, eventType: "claim_submitted", occurredAt, actorType: "passenger", note: "Synthetic passenger report submitted." },
    { eventId, eventType: "driver_alerted", occurredAt, actorType: "system", status: "driver_alerted", note: "Privacy-approved item alert assigned to the demo driver." },
  ],
});

/** @param {MockCase} mockCase @param {DriverAction} action @param {string} occurredAt @param {string} eventId @returns {MockCase} */
const transitionDriverCase = (mockCase, action, occurredAt, eventId) => {
  if (mockCase.status !== "driver_alerted") {
    throw new Error(`Case ${mockCase.caseId} cannot accept a driver action from status ${mockCase.status}.`);
  }
  const transitions = {
    secure: { status: "secured", eventType: "item_secured", note: "Driver confirmed the item is secure for operations guidance.", manualReviewReason: null },
    no_item: { status: "manual_review", eventType: "manual_review_requested", note: "Driver reported that no item was found.", manualReviewReason: "driver_reported_no_item" },
    ask_operations: { status: "manual_review", eventType: "manual_review_requested", note: "Driver requested help from operations.", manualReviewReason: "driver_requested_help" },
  };
  const transition = transitions[action];
  return {
    ...mockCase,
    status: transition.status,
    updatedAt: occurredAt,
    manualReviewReason: transition.manualReviewReason,
    auditTimeline: [...mockCase.auditTimeline, { eventId, eventType: transition.eventType, occurredAt, actorType: "driver", status: transition.status, note: transition.note }],
  };
};

/** @param {MockAlert} alert @returns {Record<string, unknown>} */
const driverAlertView = (alert) => ({
  alertId: alert.alertId,
  caseId: alert.caseId,
  tripId: alert.tripId,
  createdAt: alert.createdAt,
  updatedAt: alert.updatedAt,
  readAt: alert.readAt,
  alertStatus: alert.alertStatus,
  caseStatus: alert.caseStatus,
  detectedItem: alert.detectedItem,
  allowedActions: alert.allowedActions,
  outcomeMessage: alert.outcomeMessage,
});

/** @returns {http.RequestListener} */
const createRequestHandler = () => {
  /** @type {MockCase[]} */
  let mockCases = loadMockCases();
  /** @type {MockAlert[]} */
  let alerts = [];

  /** @param {string} tripId @returns {MockCase|null} */
  const findCase = (tripId) => mockCases.find((entry) => entry.tripId === tripId) ?? null;
  /** @param {MockCase} nextCase @returns {void} */
  const replaceCase = (nextCase) => { mockCases = mockCases.map((entry) => entry.tripId === nextCase.tripId ? nextCase : entry); };
  /** @param {string} alertId @returns {MockAlert|null} */
  const findAlert = (alertId) => alerts.find((alert) => alert.alertId === alertId && alert.assignedDriverId === demoDriver.driverId) ?? null;
  /** @param {MockAlert} nextAlert @returns {void} */
  const replaceAlert = (nextAlert) => { alerts = alerts.map((alert) => alert.alertId === nextAlert.alertId ? nextAlert : alert); };

  return async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && requestUrl.pathname === "/health") return sendJson(response, 200, { status: "ok" });

    if (request.method === "GET" && requestUrl.pathname === "/v1/mock/driver/session") {
      return sendJson(response, 200, { driver: demoDriver, vehicle: demoVehicle });
    }
    if (request.method === "GET" && requestUrl.pathname === "/v1/mock/driver/alerts") {
      const sortedAlerts = alerts.filter((alert) => alert.assignedDriverId === demoDriver.driverId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return sendJson(response, 200, { alerts: sortedAlerts.map(driverAlertView) });
    }

    const readMatch = requestUrl.pathname.match(/^\/v1\/mock\/driver\/alerts\/([^/]+)\/read$/);
    if (request.method === "POST" && readMatch) {
      const alert = findAlert(decodeURIComponent(readMatch[1]));
      if (alert === null) return sendJson(response, 404, { error: "alert_not_found", message: "No assigned mock alert exists for this ID." });
      const occurredAt = new Date().toISOString();
      const nextAlert = alert.readAt === null ? { ...alert, readAt: occurredAt, updatedAt: occurredAt, alertStatus: alert.alertStatus === "new" ? "in_progress" : alert.alertStatus } : alert;
      replaceAlert(nextAlert);
      return sendJson(response, 200, driverAlertView(nextAlert));
    }

    const actionMatch = requestUrl.pathname.match(/^\/v1\/mock\/driver\/alerts\/([^/]+)\/actions$/);
    if (request.method === "POST" && actionMatch) {
      const alertId = decodeURIComponent(actionMatch[1]);
      const alert = findAlert(alertId);
      if (alert === null) return sendJson(response, 404, { error: "alert_not_found", message: "No assigned mock alert exists for this ID." });
      /** @type {unknown} */ let body;
      try { body = await readJsonBody(request); } catch (error) { return sendJson(response, 400, { error: "invalid_json", message: error instanceof Error ? error.message : "Request body must be valid JSON." }); }
      if (!isDriverActionRequest(body)) return sendJson(response, 400, { error: "invalid_driver_action", message: "A supported driver action is required." });
      const latestAlert = findAlert(alertId);
      if (latestAlert === null) return sendJson(response, 404, { error: "alert_not_found", message: "No assigned mock alert exists for this ID." });
      if (latestAlert.allowedActions.length === 0 || latestAlert.caseStatus !== "driver_alerted") return sendJson(response, 409, { error: "driver_action_not_available", message: "This alert has already been completed." });
      const mockCase = findCase(latestAlert.tripId);
      if (mockCase === null || !hasSafeDriverEvidence(mockCase)) return sendJson(response, 409, { error: "driver_action_not_available", message: "This alert no longer has safe item evidence." });
      const occurredAt = new Date().toISOString();
      const nextCase = transitionDriverCase(mockCase, body.action, occurredAt, `EVENT-MOCK-${randomUUID()}`);
      const outcomeMessages = { secure: "Item secured. Operations will provide next steps.", no_item: "No item found was recorded. Operations has been asked to review.", ask_operations: "Your operations help request has been recorded." };
      const nextAlert = { ...latestAlert, updatedAt: occurredAt, readAt: latestAlert.readAt ?? occurredAt, alertStatus: "completed", caseStatus: nextCase.status, allowedActions: [], outcomeMessage: outcomeMessages[body.action] };
      replaceCase(nextCase);
      replaceAlert(nextAlert);
      return sendJson(response, 200, driverAlertView(nextAlert));
    }

    const detailMatch = requestUrl.pathname.match(/^\/v1\/mock\/driver\/alerts\/([^/]+)$/);
    if (request.method === "GET" && detailMatch) {
      const alert = findAlert(decodeURIComponent(detailMatch[1]));
      if (alert === null) return sendJson(response, 404, { error: "alert_not_found", message: "No assigned mock alert exists for this ID." });
      return sendJson(response, 200, driverAlertView(alert));
    }

    const caseMatch = requestUrl.pathname.match(/^\/v1\/mock\/cases\/([^/]+)$/);
    if (request.method === "GET" && caseMatch) {
      const mockCase = findCase(decodeURIComponent(caseMatch[1]));
      if (mockCase === null) return sendJson(response, 404, { error: "trip_not_found", safePassengerMessage: "We could not verify this request from the available information." });
      return sendJson(response, 200, passengerCaseView(mockCase));
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/mock/claims") {
      /** @type {unknown} */ let body;
      try { body = await readJsonBody(request); } catch (error) { return sendJson(response, 400, { error: "invalid_json", message: error instanceof Error ? error.message : "Request body must be valid JSON." }); }
      if (!isClaimRequest(body)) return sendJson(response, 400, { error: "invalid_claim", message: "A string tripId is required." });
      const mockCase = findCase(body.tripId);
      if (mockCase === null) return sendJson(response, 404, { error: "trip_not_found", safePassengerMessage: "We could not verify this request from the available information." });
      if (mockCase.status !== "detected") return sendJson(response, 200, passengerCaseView(mockCase));
      const occurredAt = new Date().toISOString();
      if (!hasSafeDriverEvidence(mockCase)) {
        const reviewedCase = routeCaseToOperations(mockCase, occurredAt, `EVENT-MOCK-${randomUUID()}`);
        replaceCase(reviewedCase);
        return sendJson(response, 200, passengerCaseView(reviewedCase));
      }
      const alertedCase = alertDriverAfterClaim(mockCase, occurredAt, `EVENT-MOCK-${randomUUID()}`);
      const alert = createDriverAlert(alertedCase, occurredAt);
      replaceCase(alertedCase);
      alerts = [...alerts, alert];
      return sendJson(response, 200, passengerCaseView(alertedCase));
    }

    return sendJson(response, 404, { error: "not_found", message: "The requested endpoint does not exist." });
  };
};

if (require.main === module) {
  const server = http.createServer(createRequestHandler());
  server.listen(port, host, () => {
    const address = server.address();
    const listeningPort = typeof address === "object" && address !== null ? address.port : port;
    console.log(JSON.stringify({ message: "TripTrace API listening", port: listeningPort }));
  });
} else {
  module.exports = { alertDriverAfterClaim, createDriverAlert, driverAlertView, hasSafeDriverEvidence, passengerCaseView, routeCaseToOperations, transitionDriverCase };
}
