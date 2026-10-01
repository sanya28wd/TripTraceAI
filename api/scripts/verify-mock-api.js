"use strict";

const { once } = require("node:events");
const { spawn } = require("node:child_process");
const path = require("node:path");

const apiDirectory = path.join(__dirname, "..");

/** @returns {Promise<{server: import("node:child_process").ChildProcess, baseUrl: string}>} */
const startServer = async () => {
  const server = spawn(process.execPath, ["src/server.js"], {
    cwd: apiDirectory,
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  let output = "";
  let errorOutput = "";
  server.stderr.on("data", (chunk) => { errorOutput += chunk; });
  const listeningPort = await new Promise((resolve, reject) => {
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const line = output.split("\n").find((entry) => entry.includes("TripTrace API listening"));
      if (line === undefined) return;
      try { resolve(JSON.parse(line).port); } catch (error) { reject(error); }
    });
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`Mock API exited during startup (${code}): ${errorOutput}`)));
  });
  return { server, baseUrl: `http://127.0.0.1:${listeningPort}` };
};

/** @param {import("node:child_process").ChildProcess} server @returns {Promise<void>} */
const stopServer = async (server) => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill();
  await once(server, "exit");
};

/** @param {string} baseUrl @param {string} url @param {RequestInit|undefined} options @returns {Promise<{response: Response, payload: unknown}>} */
const request = async (baseUrl, url, options) => {
  const response = await fetch(`${baseUrl}${url}`, options);
  return { response, payload: await response.json() };
};

/** @param {string} baseUrl @returns {Promise<any>} */
const submitDriverDemoClaim = async (baseUrl) => {
  const { response, payload } = await request(baseUrl, "/v1/mock/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tripId: "TRIP-1001", description: "Synthetic black bag" }),
  });
  if (!response.ok || payload.status !== "driver_alerted") throw new Error("Passenger report did not create the driver-alert case state.");
  if ("detectedItem" in payload || "claim" in payload || "alerts" in payload) throw new Error("Passenger response leaked driver-only evidence.");
  return payload;
};

/** @param {string} action @param {string} expectedCaseStatus @returns {Promise<void>} */
const verifyDriverAction = async (action, expectedCaseStatus) => {
  const { server, baseUrl } = await startServer();
  try {
    await submitDriverDemoClaim(baseUrl);
    const { payload: inbox } = await request(baseUrl, "/v1/mock/driver/alerts");
    const alert = inbox.alerts[0];
    const { response: actionResponse, payload: completedAlert } = await request(baseUrl, `/v1/mock/driver/alerts/${alert.alertId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!actionResponse.ok || completedAlert.caseStatus !== expectedCaseStatus || completedAlert.alertStatus !== "completed" || completedAlert.allowedActions.length !== 0) {
      throw new Error(`${action} action produced an invalid completed alert.`);
    }
    const { response: duplicate } = await request(baseUrl, `/v1/mock/driver/alerts/${alert.alertId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (duplicate.status !== 409) throw new Error(`${action} duplicate action was not rejected.`);
    const { payload: passengerCase } = await request(baseUrl, "/v1/mock/cases/TRIP-1001");
    if (passengerCase.status !== expectedCaseStatus || /bag|image|driver/i.test(passengerCase.safePassengerMessage)) {
      throw new Error(`${action} leaked details or failed to update passenger-safe progress.`);
    }
  } finally {
    await stopServer(server);
  }
};

const verify = async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { response: health, payload: healthPayload } = await request(baseUrl, "/health");
    if (!health.ok || healthPayload.status !== "ok") throw new Error("Health check failed.");
    const { response: session, payload: sessionPayload } = await request(baseUrl, "/v1/mock/driver/session");
    if (!session.ok || sessionPayload.driver.driverId !== "DRIVER-MOCK-001" || sessionPayload.vehicle.vehicleId !== "VEHICLE-MOCK-204") throw new Error("Driver session failed.");
    const { payload: emptyInbox } = await request(baseUrl, "/v1/mock/driver/alerts");
    if (!Array.isArray(emptyInbox.alerts) || emptyInbox.alerts.length !== 0) throw new Error("Driver inbox is not empty before the passenger report.");

    await submitDriverDemoClaim(baseUrl);
    const { payload: inbox } = await request(baseUrl, "/v1/mock/driver/alerts");
    if (inbox.alerts.length !== 1) throw new Error("Expected one assigned driver alert.");
    const alert = inbox.alerts[0];
    if (alert.tripId !== "TRIP-1001" || alert.caseId !== "CASE-MOCK-1001" || alert.alertStatus !== "new" || alert.readAt !== null) throw new Error("Driver alert identity or unread state is invalid.");
    const expectedItem = { category: "bag", colour: "black", seatAreaHint: "right_seat", imageUrl: "/assets/mock/black-bag-safe-crop.png", imageAlt: "Synthetic close crop of a plain black shoulder bag on a blurred fabric seat." };
    if (JSON.stringify(alert.detectedItem) !== JSON.stringify(expectedItem)) throw new Error("Driver alert does not contain the approved safe item crop.");
    if ("assignedDriverId" in alert || "confidence" in alert.detectedItem || "boundingBox" in alert.detectedItem || "claim" in alert) throw new Error("Driver alert exposes internal or passenger data.");

    const { payload: unreadDetail } = await request(baseUrl, `/v1/mock/driver/alerts/${alert.alertId}`);
    if (unreadDetail.readAt !== null) throw new Error("Reading alert detail changed read state before the read endpoint.");
    const { payload: readAlert } = await request(baseUrl, `/v1/mock/driver/alerts/${alert.alertId}/read`, { method: "POST" });
    if (readAlert.readAt === null || readAlert.alertStatus !== "in_progress") throw new Error("Opening an alert did not record read state.");

    const { response: unknown } = await request(baseUrl, "/v1/mock/driver/alerts/ALERT-UNKNOWN");
    if (unknown.status !== 404) throw new Error("Unknown driver alert did not return 404.");
  } finally {
    await stopServer(server);
  }

  await verifyDriverAction("secure", "secured");
  await verifyDriverAction("no_item", "manual_review");
  await verifyDriverAction("ask_operations", "manual_review");
  console.log("Mock API verification passed.");
};

verify().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
