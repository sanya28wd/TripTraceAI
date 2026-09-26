"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = 8000;
const mockCasesPath = path.join(__dirname, "..", "mock-data", "cases.json");

/** @typedef {"detected" | "claim_submitted" | "clarification_needed" | "matched" | "driver_alerted" | "secured" | "manual_review" | "closed"} CaseStatus */

/**
 * @typedef {object} MockCase
 * @property {string} tripId
 * @property {string} caseId
 * @property {CaseStatus} status
 * @property {"en" | "ar"} language
 * @property {{category: string, colour: string | null, passengerWording: string}} claim
 * @property {"safe_status" | "clarification" | "manual_review"} responseType
 * @property {string} safePassengerMessage
 * @property {string | null} clarificationQuestion
 * @property {string | null} manualReviewReason
 * @property {Array<{eventId: string, eventType: string, occurredAt: string, actorType: string, note: string}>} auditTimeline
 */

/** @returns {MockCase[]} */
const loadMockCases = () => {
  const fileContents = fs.readFileSync(mockCasesPath, "utf8");
  return JSON.parse(fileContents);
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
    } catch (error) {
      reject(new Error("Request body must be valid JSON."));
    }
  });
  request.on("error", reject);
});

/** @param {unknown} value @returns {value is {tripId: string, description?: string, language?: string}} */
const isClaimRequest = (value) => typeof value === "object" && value !== null
  && "tripId" in value && typeof value.tripId === "string";

const requestHandler = async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  const caseMatch = requestUrl.pathname.match(/^\/v1\/mock\/cases\/([^/]+)$/);
  if (request.method === "GET" && caseMatch) {
    const tripId = decodeURIComponent(caseMatch[1]);
    const mockCase = loadMockCases().find((entry) => entry.tripId === tripId);
    if (!mockCase) {
      sendJson(response, 404, {
        error: "trip_not_found",
        safePassengerMessage: "We could not verify this request from the available information.",
      });
      return;
    }
    sendJson(response, 200, mockCase);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/v1/mock/claims") {
    try {
      const body = await readJsonBody(request);
      if (!isClaimRequest(body)) {
        sendJson(response, 400, { error: "invalid_claim", message: "A string tripId is required." });
        return;
      }
      const mockCase = loadMockCases().find((entry) => entry.tripId === body.tripId);
      if (!mockCase) {
        sendJson(response, 404, {
          error: "trip_not_found",
          safePassengerMessage: "We could not verify this request from the available information.",
        });
        return;
      }
      sendJson(response, 200, {
        tripId: mockCase.tripId,
        caseId: mockCase.caseId,
        status: mockCase.status,
        responseType: mockCase.responseType,
        safePassengerMessage: mockCase.safePassengerMessage,
        clarificationQuestion: mockCase.clarificationQuestion,
        manualReviewReason: mockCase.manualReviewReason,
        claim: mockCase.claim,
      });
    } catch (error) {
      sendJson(response, 400, { error: "invalid_json", message: "Request body must be valid JSON." });
    }
    return;
  }

  sendJson(response, 404, { error: "not_found", message: "The requested endpoint does not exist." });
};

const server = http.createServer(requestHandler);

server.listen(port, () => {
  console.log(JSON.stringify({ message: "TripTrace API listening", port }));
});
