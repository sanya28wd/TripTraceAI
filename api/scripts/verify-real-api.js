"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { databaseFileName, openDatabase } = require("../src/db");
const { appendAuditEvent, createCase, getCaseTimeline, listAuditEvents, TripNotFoundError } = require("../src/cases-repo");
const { createTrip } = require("../src/trips-repo");
const { deleteObject, getObjectPath, objectsDirectoryName, putObject, readObject, sha256Hex } = require("../src/object-store");
const { CaseNotFoundError, saveCaseImage } = require("../src/images-repo");
const { generateUniqueTripId, isTripId, newTripId, tripIdAlphabet } = require("../src/ids");

const apiDirectory = path.join(__dirname, "..");
const stagedImagePath = path.join(apiDirectory, "..", "web", "assets", "mock", "black-bag-safe-crop.png");
const fakeJpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

/** @param {string} dataDir @returns {string[]} */
const listObjectFiles = (dataDir) => {
  const directory = path.join(dataDir, objectsDirectoryName);
  return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
};

/** @param {string} dataDir @returns {Promise<{server: import("node:child_process").ChildProcess, baseUrl: string}>} */
const startServer = async (dataDir) => {
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.js"], {
    cwd: apiDirectory,
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATA_DIR: dataDir },
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
    server.once("exit", (code) => reject(new Error(`API exited during startup (${code}): ${errorOutput}`)));
  });
  return { server, baseUrl: `http://127.0.0.1:${listeningPort}` };
};

/** @param {import("node:child_process").ChildProcess} server @returns {Promise<void>} */
const stopServer = async (server) => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill();
  await once(server, "exit");
};

const verifyTripIdGeneration = () => {
  const fixedDate = new Date("2026-10-08T23:59:59Z");
  const taken = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const id = generateUniqueTripId((candidate) => taken.has(candidate), fixedDate);
    assert.ok(isTripId(id), `Malformed Trip ID: ${id}`);
    assert.ok(id.startsWith("TRIP-20261008-"), `Trip ID must use the UTC date: ${id}`);
    taken.add(id);
  }
  assert.equal(taken.size, 1000, "1,000 generated Trip IDs must be unique.");
  assert.ok(!/[01ILO]/.test(tripIdAlphabet), "Alphabet must exclude lookalike characters.");
  console.log("ok - 1,000 Trip IDs are well-formed and unique");

  let checks = 0;
  const retried = generateUniqueTripId(() => { checks += 1; return checks <= 3; }, fixedDate);
  assert.equal(checks, 4, "A taken Trip ID must be retried.");
  assert.ok(isTripId(retried));
  assert.throws(() => generateUniqueTripId(() => true), /Could not generate an unused Trip ID/);
  assert.ok(isTripId(newTripId()));
  console.log("ok - collisions are retried, and exhaustion fails loudly");
};

/** @param {string} baseUrl */
const verifyCreateTripEndpoint = async (baseUrl) => {
  const first = await fetch(`${baseUrl}/v1/trips`, { method: "POST" });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.ok(isTripId(firstBody.tripId), `Endpoint returned malformed Trip ID: ${firstBody.tripId}`);
  assert.ok(!Number.isNaN(Date.parse(firstBody.createdAt)), "createdAt must be an ISO timestamp.");

  const second = await (await fetch(`${baseUrl}/v1/trips`, { method: "POST" })).json();
  assert.notEqual(second.tripId, firstBody.tripId, "Each request must return a new Trip ID.");

  const wrongMethod = await fetch(`${baseUrl}/v1/trips`);
  assert.equal(wrongMethod.status, 404);
  console.log(`ok - POST /v1/trips returned ${firstBody.tripId}`);

  const fetched = await fetch(`${baseUrl}/v1/trips/${firstBody.tripId}`);
  assert.equal(fetched.status, 200);
  assert.deepEqual(await fetched.json(), firstBody);
  const missing = await fetch(`${baseUrl}/v1/trips/TRIP-20260101-ZZZZ`);
  assert.equal(missing.status, 404);
  console.log("ok - GET /v1/trips/:tripId returns stored trips and 404s unknown ones");
  return firstBody;
};

/** @param {string} dataDir */
const verifySchema = (dataDir) => {
  const db = openDatabase(dataDir);
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
    assert.deepEqual(tables, ["audit_events", "cases", "images", "trips"]);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1, "Foreign keys must be enforced.");
    db.prepare("INSERT INTO trips (trip_id, created_at) VALUES (?, ?)").run("TRIP-20260101-AAAA", "2026-01-01T00:00:00.000Z");
    assert.throws(() => db.prepare("INSERT INTO trips (trip_id, created_at) VALUES (?, ?)").run("TRIP-20260101-AAAA", "2026-01-01T00:00:00.000Z"), /UNIQUE constraint failed/);
    assert.throws(() => db.prepare("INSERT INTO cases (case_id, trip_id, status, source_type, created_at, updated_at) VALUES ('CASE-X', 'TRIP-MISSING', 'detected', 'manual_entry', 'now', 'now')").run(), /FOREIGN KEY constraint failed/);
    assert.throws(() => db.prepare("INSERT INTO cases (case_id, trip_id, status, source_type, created_at, updated_at) VALUES ('CASE-X', 'TRIP-20260101-AAAA', 'detected', 'made_up', 'now', 'now')").run(), /CHECK constraint failed/);
  } finally {
    db.close();
  }
  const reopened = openDatabase(dataDir);
  try {
    assert.equal(reopened.prepare("SELECT COUNT(*) AS count FROM trips").get().count, 1, "Reopening must not wipe existing rows.");
  } finally {
    reopened.close();
  }
  console.log("ok - schema has 4 tables, enforces keys and source types, and reopens without data loss");
};

/** @param {string} dataDir */
const verifyCaseCreation = (dataDir) => {
  const db = openDatabase(dataDir);
  /** @param {string} table @returns {number} */
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  try {
    const trip = createTrip(db);
    const detected = createCase(db, { tripId: trip.tripId, sourceType: "detection" });
    assert.equal(detected.status, "detected");
    assert.equal(detected.privacy, "not_started");
    const detectedEvents = listAuditEvents(db, detected.caseId);
    assert.deepEqual(detectedEvents.map((event) => [event.eventType, event.actorType, event.status]), [["case_created", "system", "detected"]]);
    assert.equal(detectedEvents[0].occurredAt, detected.createdAt, "The audit event and the case must share one timestamp.");

    const claimed = createCase(db, { tripId: trip.tripId, sourceType: "passenger_claim" });
    assert.equal(claimed.status, "claim_submitted");
    assert.deepEqual(listAuditEvents(db, claimed.caseId).map((event) => [event.eventType, event.actorType]), [["claim_submitted", "passenger"]]);
    console.log("ok - detection and passenger_claim cases start in their documented states with one audit event");

    assert.throws(() => createCase(db, { tripId: "TRIP-20260101-ZZZZ", sourceType: "detection" }), TripNotFoundError);
    assert.equal(count("cases"), 2, "An unknown trip must not create a case.");

    // Force the second write (the audit event) to fail, and prove the first write (the case) is undone.
    db.exec("CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END;");
    assert.throws(() => createCase(db, { tripId: trip.tripId, sourceType: "detection" }), /simulated audit failure/);
    db.exec("DROP TRIGGER fail_audit;");
    assert.equal(count("cases"), 2, "A failed audit write must roll back the case insert.");
    assert.equal(count("audit_events"), 2);
    console.log("ok - a failed audit write rolls back the case, leaving no half-written rows");
  } finally {
    db.close();
  }
};

/** @param {string} dataDir */
const verifyObjectStore = async (dataDir) => {
  // Known SHA-256 test vector, so the hash is checked against an outside reference, not just itself.
  assert.equal(sha256Hex(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const stored = await putObject(dataDir, bytes);
  assert.match(stored.storageKey, /^[0-9a-f-]{36}$/);
  assert.equal(stored.sizeBytes, bytes.byteLength);
  assert.equal(stored.sha256, sha256Hex(bytes));
  const readBack = await readObject(dataDir, stored.storageKey);
  assert.ok(readBack.equals(bytes), "Bytes read back must match the bytes written.");
  assert.equal(sha256Hex(readBack), stored.sha256, "The stored hash must verify the file on disk.");
  console.log("ok - objects round-trip with matching bytes and SHA-256");

  const second = await putObject(dataDir, bytes);
  assert.notEqual(second.storageKey, stored.storageKey, "Identical uploads still get separate keys.");
  const entries = fs.readdirSync(path.join(dataDir, objectsDirectoryName)).sort();
  assert.deepEqual(entries, [stored.storageKey, second.storageKey].sort(), "Only finished objects, no temp files, may remain.");

  for (const badKey of ["../triptrace.sqlite", "/etc/passwd", "photo.jpg", `${stored.storageKey}/../x`, ""]) {
    assert.throws(() => getObjectPath(dataDir, badKey), /Invalid storage key/, `Key must be rejected: ${badKey}`);
  }
  await deleteObject(dataDir, second.storageKey);
  assert.equal(fs.existsSync(getObjectPath(dataDir, second.storageKey)), false);
  console.log("ok - keys are random, temp files are cleaned up, and path tricks are rejected");
};

/** @param {string} dataDir */
const verifyImageSaveCleanup = async (dataDir) => {
  const db = openDatabase(dataDir);
  try {
    const trip = createTrip(db);
    const storedCase = createCase(db, { tripId: trip.tripId, sourceType: "detection" });

    await assert.rejects(saveCaseImage(db, dataDir, { caseId: "CASE-missing", contentType: "image/jpeg", bytes: fakeJpegBytes }), CaseNotFoundError);
    assert.deepEqual(listObjectFiles(dataDir), [], "An upload for an unknown case must not leave a file behind.");

    db.exec("CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END;");
    await assert.rejects(saveCaseImage(db, dataDir, { caseId: storedCase.caseId, contentType: "image/jpeg", bytes: fakeJpegBytes }), /simulated audit failure/);
    db.exec("DROP TRIGGER fail_audit;");
    assert.deepEqual(listObjectFiles(dataDir), [], "A failed database write must delete the stored file.");
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM images").get().count), 0, "A failed audit write must roll back the image row.");
    assert.equal(getCaseUpdatedAt(db, storedCase.caseId), storedCase.updatedAt, "A failed upload must not touch the case.");
    console.log("ok - failed image saves leave no file, no image row, and no case change");
  } finally {
    db.close();
  }
};

/** @param {import("node:sqlite").DatabaseSync} db @param {string} caseId @returns {string} */
const getCaseUpdatedAt = (db, caseId) => String(db.prepare("SELECT updated_at FROM cases WHERE case_id = ?").get(caseId).updated_at);

/** @param {string} baseUrl @param {string} dataDir @param {string} caseId */
const verifyImageUploadEndpoints = async (baseUrl, dataDir, caseId) => {
  const uploadUrl = `${baseUrl}/v1/cases/${caseId}/images`;
  /** @param {BodyInit} body @param {string} contentType @param {RequestInit} [extra] */
  const upload = (body, contentType, extra = {}) => fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body, ...extra });

  const stagedBytes = fs.readFileSync(stagedImagePath);
  const created = await upload(stagedBytes, "image/png");
  assert.equal(created.status, 201);
  const image = await created.json();
  assert.match(image.imageId, /^IMAGE-[0-9a-f-]{36}$/);
  assert.deepEqual(
    { caseId: image.caseId, contentType: image.contentType, sizeBytes: image.sizeBytes, sha256: image.sha256, url: image.url },
    { caseId, contentType: "image/png", sizeBytes: stagedBytes.byteLength, sha256: sha256Hex(stagedBytes), url: `/v1/images/${image.imageId}` },
  );
  const caseAfterUpload = await (await fetch(`${baseUrl}/v1/cases/${caseId}`)).json();
  assert.equal(caseAfterUpload.updatedAt, image.uploadedAt, "Uploading must bump the case's updatedAt.");

  const downloaded = await fetch(`${baseUrl}${image.url}`);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get("content-type"), "image/png");
  assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
  assert.equal(downloaded.headers.get("cache-control"), "private, no-store");
  assert.ok(Buffer.from(await downloaded.arrayBuffer()).equals(stagedBytes), "Downloaded bytes must match the upload.");
  console.log(`ok - staged PNG (${stagedBytes.byteLength} bytes) uploaded as ${image.imageId} and downloaded intact`);

  const jpeg = await upload(fakeJpegBytes, "image/jpeg; charset=binary");
  assert.equal(jpeg.status, 201, "JPEG uploads (with header parameters) must be accepted.");
  const filesAfterGoodUploads = listObjectFiles(dataDir).sort();
  assert.equal(filesAfterGoodUploads.length, 2);

  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const rejections = [
    ["text disguised as JPEG", await upload("hello, I am not an image", "image/jpeg"), 415],
    ["PNG bytes labelled as JPEG", await upload(stagedBytes, "image/jpeg"), 415],
    ["GIF content type", await upload(fakeJpegBytes, "image/gif"), 415],
    ["missing content type", await fetch(uploadUrl, { method: "POST", body: fakeJpegBytes }), 415],
    ["empty body", await upload(Buffer.alloc(0), "image/png"), 400],
    ["6 MB with Content-Length", await upload(Buffer.concat([pngHeader, Buffer.alloc(6 * 1024 * 1024)]), "image/png"), 413],
    ["6 MB streamed without Content-Length", await upload(new ReadableStream({
      start(controller) {
        controller.enqueue(pngHeader);
        for (let index = 0; index < 6; index += 1) controller.enqueue(new Uint8Array(1024 * 1024));
        controller.close();
      },
    }), "image/png", { duplex: "half" }), 413],
    ["unknown case", await fetch(`${baseUrl}/v1/cases/CASE-missing/images`, { method: "POST", headers: { "Content-Type": "image/png" }, body: stagedBytes }), 404],
    ["unknown image", await fetch(`${baseUrl}/v1/images/IMAGE-missing`), 404],
  ];
  for (const [label, response, expectedStatus] of rejections) {
    assert.equal(response.status, expectedStatus, `${label}: expected ${expectedStatus}, got ${response.status}`);
    const body = await response.json();
    if (expectedStatus === 415 || expectedStatus === 413) assert.equal(body.message, "Only JPEG or PNG images up to 5 MB are accepted.");
  }
  assert.deepEqual(listObjectFiles(dataDir).sort(), filesAfterGoodUploads, "Rejected uploads must not leave files behind.");
  console.log(`ok - ${rejections.length} bad requests rejected (415/413/400/404) and no files left behind`);
  return image;
};

/** @param {string} baseUrl @param {string} tripId */
const verifyCaseEndpoints = async (baseUrl, tripId) => {
  /** @param {unknown} body */
  const postCase = (body) => fetch(`${baseUrl}/v1/cases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const created = await postCase({ tripId, sourceType: "detection" });
  assert.equal(created.status, 201);
  const storedCase = await created.json();
  assert.match(storedCase.caseId, /^CASE-[0-9a-f-]{36}$/);
  assert.equal(storedCase.tripId, tripId);
  assert.equal(storedCase.status, "detected");

  const fetched = await fetch(`${baseUrl}/v1/cases/${storedCase.caseId}`);
  assert.equal(fetched.status, 200);
  assert.deepEqual(await fetched.json(), { ...storedCase, images: [] }, "A new case has no images yet.");
  console.log(`ok - POST /v1/cases stored ${storedCase.caseId}`);

  assert.equal((await postCase({ tripId: "TRIP-20260101-ZZZZ", sourceType: "detection" })).status, 404);
  assert.equal((await postCase({ tripId, sourceType: "manual_entry" })).status, 400);
  assert.equal((await postCase({ sourceType: "detection" })).status, 400);
  const badJson = await fetch(`${baseUrl}/v1/cases`, { method: "POST", body: "{not json" });
  assert.equal(badJson.status, 400);
  assert.equal((await fetch(`${baseUrl}/v1/cases/CASE-missing`)).status, 404);
  console.log("ok - case endpoints reject bad input (400) and unknown trips or cases (404)");
  return storedCase;
};

/** @param {string} dataDir */
const verifyTimelineOrdering = (dataDir) => {
  const db = openDatabase(dataDir);
  try {
    const trip = createTrip(db);
    const storedCase = createCase(db, { tripId: trip.tripId, sourceType: "detection" }, new Date("2026-10-08T10:00:00.000Z"));
    const sameInstant = "2026-10-08T10:05:00.000Z";
    // Inserted out of time order, and two share one millisecond, like the mock's claim + alert pair.
    appendAuditEvent(db, { caseId: storedCase.caseId, eventType: "third", occurredAt: "2026-10-08T10:09:00.000Z", actorType: "system" });
    appendAuditEvent(db, { caseId: storedCase.caseId, eventType: "first_same_instant", occurredAt: sameInstant, actorType: "system" });
    appendAuditEvent(db, { caseId: storedCase.caseId, eventType: "second_same_instant", occurredAt: sameInstant, actorType: "system" });
    const timeline = getCaseTimeline(db, storedCase.caseId);
    assert.deepEqual(timeline.auditTimeline.map((event) => event.eventType), ["case_created", "first_same_instant", "second_same_instant", "third"]);
    assert.deepEqual(Object.keys(timeline.auditTimeline[1]).sort(), ["actorType", "eventId", "eventType", "occurredAt"], "Empty optional fields must be left out, not sent as null.");
    assert.equal(getCaseTimeline(db, "CASE-missing"), null);
    console.log("ok - timeline sorts by time, keeps insertion order within one millisecond, and omits empty fields");
  } finally {
    db.close();
  }
};

/** @param {string} baseUrl @param {string} caseId @param {Record<string, unknown>} image */
const verifyTimelineEndpoints = async (baseUrl, caseId, image) => {
  const response = await fetch(`${baseUrl}/v1/cases/${caseId}/timeline`);
  assert.equal(response.status, 200);
  const timeline = await response.json();
  assert.deepEqual(Object.keys(timeline).sort(), ["auditTimeline", "caseId", "status", "tripId"]);
  assert.equal(timeline.caseId, caseId);
  assert.deepEqual(timeline.auditTimeline.map((event) => event.eventType), ["case_created", "image_uploaded", "image_uploaded"]);
  const [created, uploaded] = timeline.auditTimeline;
  assert.deepEqual(created, { eventId: created.eventId, eventType: "case_created", occurredAt: created.occurredAt, actorType: "system", status: "detected", note: "Case created from a staged item image." });
  assert.equal(uploaded.details.imageId, image.imageId);
  assert.equal("status" in uploaded, false, "An upload does not change status, so the event has no status.");
  assert.ok(!JSON.stringify(timeline).includes("storage"), "Internal storage keys must never leave the server.");
  console.log("ok - GET /v1/cases/:caseId/timeline returns case_created then image_uploaded in the documented shape");

  const caseResponse = await (await fetch(`${baseUrl}/v1/cases/${caseId}`)).json();
  assert.equal(caseResponse.images.length, 2);
  assert.deepEqual(caseResponse.images[0], image, "Case images must match the upload response.");
  assert.ok(!JSON.stringify(caseResponse).includes("storage"), "Internal storage keys must never leave the server.");
  console.log("ok - GET /v1/cases/:caseId lists its images with download URLs");

  assert.equal((await fetch(`${baseUrl}/v1/cases/CASE-missing/timeline`)).status, 404);
  return timeline;
};

/** @param {string} dataDir @param {{tripId: string, createdAt: string}} trip @param {Record<string, unknown>} storedCase @param {Record<string, unknown>} image @param {Record<string, unknown>} timeline */
const verifySurvivesRestart = async (dataDir, trip, storedCase, image, timeline) => {
  const { server, baseUrl } = await startServer(dataDir);
  try {
    const fetched = await fetch(`${baseUrl}/v1/trips/${trip.tripId}`);
    assert.equal(fetched.status, 200, "Trip must still exist after a restart.");
    assert.deepEqual(await fetched.json(), trip);
    const fetchedCase = await fetch(`${baseUrl}/v1/cases/${storedCase.caseId}`);
    assert.equal(fetchedCase.status, 200, "Case must still exist after a restart.");
    const { images, ...fetchedCaseBody } = await fetchedCase.json();
    assert.deepEqual({ ...fetchedCaseBody, updatedAt: storedCase.updatedAt }, storedCase);
    assert.equal(images.length, 2);
    const fetchedTimeline = await fetch(`${baseUrl}/v1/cases/${storedCase.caseId}/timeline`);
    assert.deepEqual(await fetchedTimeline.json(), timeline, "The timeline must be identical after a restart.");
    const downloaded = await fetch(`${baseUrl}${image.url}`);
    assert.equal(downloaded.status, 200, "Image must still be downloadable after a restart.");
    assert.equal(sha256Hex(Buffer.from(await downloaded.arrayBuffer())), image.sha256, "Image bytes must be unchanged after a restart.");
  } finally {
    await stopServer(server);
  }
  const db = new DatabaseSync(path.join(dataDir, databaseFileName), { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM trips").get().count, 2, "Both trips created before the restart must be on disk.");
    const events = listAuditEvents(db, String(storedCase.caseId));
    assert.deepEqual(events.map((event) => event.eventType), ["case_created", "image_uploaded", "image_uploaded"]);
    assert.deepEqual(Object.keys(events[1].details).sort(), ["contentType", "imageId", "sha256", "sizeBytes"], "Audit details must hold no file name or personal data.");
    assert.equal(events[1].details.imageId, image.imageId);
  } finally {
    db.close();
  }
  console.log(`ok - ${trip.tripId}, ${storedCase.caseId} and ${image.imageId} are still stored after restarting the server`);
  console.log("ok - the timeline is identical after restart, with no file names in upload details");
};

const main = async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "triptrace-verify-"));
  try {
    verifyTripIdGeneration();
    verifySchema(path.join(tempRoot, "schema-check"));
    verifyCaseCreation(path.join(tempRoot, "case-check"));
    await verifyObjectStore(path.join(tempRoot, "object-check"));
    await verifyImageSaveCleanup(path.join(tempRoot, "image-cleanup-check"));
    verifyTimelineOrdering(path.join(tempRoot, "timeline-check"));

    const dataDir = path.join(tempRoot, "server");
    const { server, baseUrl } = await startServer(dataDir);
    let trip;
    let storedCase;
    let image;
    let timeline;
    try {
      trip = await verifyCreateTripEndpoint(baseUrl);
      storedCase = await verifyCaseEndpoints(baseUrl, trip.tripId);
      image = await verifyImageUploadEndpoints(baseUrl, dataDir, storedCase.caseId);
      timeline = await verifyTimelineEndpoints(baseUrl, storedCase.caseId, image);
    } finally {
      await stopServer(server);
    }
    await verifySurvivesRestart(dataDir, trip, storedCase, image, timeline);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log("Real API checks passed.");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
