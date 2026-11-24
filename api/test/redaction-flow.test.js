"use strict";

// Runs the real Node storage code against the real privacy gateway (FastAPI + redaction core) with
// fake detectors. Needs python3 with fastapi, uvicorn, pillow, opencv, numpy. Run: node --test test/redaction-flow.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const { openDatabase } = require("../src/db");
const { createTrip } = require("../src/trips-repo");
const { createCase, getCase, listAuditEvents } = require("../src/cases-repo");
const { CaseNotFoundError, getServableImage, listCaseImages, PrivacyBlockedError, saveCaseImage } = require("../src/images-repo");

const python = process.env.PYTHON ?? "python3";
const serviceDir = path.join(__dirname, "..", "..", "privacy-service");
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "triptrace-redaction-"));

const run = (code, ...args) => {
  const result = spawnSync(python, ["-c", code, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

// 200x100 orange JPEG. The fake detector's "face" is the central box x 80-120, y 30-70.
const fixturePath = path.join(workDir, "cabin.jpg");
run("from PIL import Image; import sys; Image.new('RGB',(200,100),(200,120,40)).save(sys.argv[1],'JPEG',quality=95)", fixturePath);
const originalBytes = fs.readFileSync(fixturePath);
const centerPixel = (file) => run("from PIL import Image; import sys; print(Image.open(sys.argv[1]).convert('RGB').getpixel((100,50)))", file);
const centerIsBlack = (file) => centerPixel(file) === "(0, 0, 0)";

let nextPort = 18100 + Math.floor(Math.random() * 500);
/** Starts the gateway in a mode and points the Node client at it. Returns a stop function. */
const startGateway = async (mode) => {
  const port = nextPort++;
  const child = spawn(python, [path.join(serviceDir, "tests", "fake_server.py"), String(port), mode], { stdio: "inherit" });
  process.env.REDACTION_URL = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { await fetch(`${process.env.REDACTION_URL}/health`); return () => child.kill(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  child.kill();
  throw new Error("gateway did not start");
};

const newHarness = (sourceType = "detection") => {
  const dataDir = fs.mkdtempSync(path.join(workDir, "data-"));
  const db = openDatabase(dataDir);
  const { tripId } = createTrip(db, new Date());
  const { caseId } = createCase(db, { tripId, sourceType }, new Date());
  const objectFiles = () => (fs.existsSync(path.join(dataDir, "objects")) ? fs.readdirSync(path.join(dataDir, "objects")) : []);
  const upload = { caseId, contentType: "image/jpeg", bytes: originalBytes };
  return { db, dataDir, caseId, objectFiles, upload };
};
const eventTypes = (db, caseId) => listAuditEvents(db, caseId).map((event) => event.eventType);

test("passed: only the redacted image is stored, and it is served and audited", async () => {
  const stop = await startGateway("ok");
  try {
    const { db, dataDir, caseId, objectFiles, upload } = newHarness();
    const image = await saveCaseImage(db, dataDir, upload, new Date());

    const files = objectFiles();
    assert.equal(files.length, 1, "exactly one object, no temp or original copy");
    const storedPath = path.join(dataDir, "objects", files[0]);
    assert.notDeepEqual(fs.readFileSync(storedPath), originalBytes);
    assert.equal(centerIsBlack(storedPath), true, "face region is black on disk");
    assert.equal(image.sha256, require("node:crypto").createHash("sha256").update(fs.readFileSync(storedPath)).digest("hex"));

    assert.equal(getCase(db, caseId).privacy, "passed");
    assert.equal(listCaseImages(db, caseId).length, 1);
    assert.notEqual(getServableImage(db, image.imageId), null);
    assert.deepEqual(eventTypes(db, caseId), ["case_created", "redaction_passed", "image_uploaded"]);
    const audit = listAuditEvents(db, caseId).find((event) => event.eventType === "redaction_passed");
    assert.deepEqual(audit.details.regionCounts, { face: 1 });
    assert.equal(JSON.stringify(audit).includes("box"), false, "audit holds counts, not coordinates");
  } finally { stop(); }
});

test("detector crash: nothing stored, case goes to manual review, reason audited", async () => {
  const stop = await startGateway("crash");
  try {
    const { db, dataDir, caseId, objectFiles, upload } = newHarness();
    await assert.rejects(saveCaseImage(db, dataDir, upload, new Date()), (error) => {
      assert.ok(error instanceof PrivacyBlockedError);
      assert.equal(error.reason, "detector_error:fake-face");
      assert.equal(error.unavailable, false);
      return true;
    });
    assert.deepEqual(objectFiles(), [], "no file on disk, redacted or not");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM images").get().n, 0);
    const stored = getCase(db, caseId);
    assert.equal(stored.privacy, "failed");
    assert.equal(stored.status, "manual_review");
    assert.deepEqual(eventTypes(db, caseId), ["case_created", "privacy_check_failed", "manual_review_requested"]);
  } finally { stop(); }
});

test("gateway down: blocked as retryable, nothing stored", async () => {
  process.env.REDACTION_URL = "http://127.0.0.1:1"; // nothing listens here
  const { db, dataDir, objectFiles, upload } = newHarness();
  await assert.rejects(saveCaseImage(db, dataDir, upload, new Date()), (error) => {
    assert.equal(error.reason, "redaction_unavailable");
    assert.equal(error.unavailable, true);
    return true;
  });
  assert.deepEqual(objectFiles(), []);
});

test("gateway without detectors (503): blocked", async () => {
  const stop = await startGateway("notready");
  try {
    const { db, dataDir, objectFiles, upload } = newHarness();
    await assert.rejects(saveCaseImage(db, dataDir, upload, new Date()), (error) => error.reason === "detectors_not_ready" && error.unavailable);
    assert.deepEqual(objectFiles(), []);
  } finally { stop(); }
});

test("a 'passed' reply that is not a real image is refused", async () => {
  const { db, dataDir, caseId, objectFiles, upload } = newHarness();
  const lying = async () => ({ status: "passed", bytes: Buffer.from("definitely not a jpeg"), contentType: "image/jpeg", report: { policyVersion: "x", detectors: {}, regionCounts: {}, regions: [] } });
  await assert.rejects(saveCaseImage(db, dataDir, upload, new Date(), lying), (error) => error.reason === "redaction_bad_response");
  assert.deepEqual(objectFiles(), []);
  assert.equal(getCase(db, caseId).privacy, "failed");
});

test("blocking does not rewind a case that has already moved on", async () => {
  const { db, dataDir, caseId, upload } = newHarness("passenger_claim");
  const failing = async () => ({ status: "failed", reason: "decode_failed" });
  await assert.rejects(saveCaseImage(db, dataDir, upload, new Date(), failing), PrivacyBlockedError);
  assert.equal(getCase(db, caseId).status, "claim_submitted");
  assert.deepEqual(eventTypes(db, caseId), ["claim_submitted", "privacy_check_failed"]);
});

test("unknown case: no redaction call, no side effects", async () => {
  const { db, dataDir, objectFiles, upload } = newHarness();
  let called = false;
  const spy = async () => { called = true; return { status: "failed", reason: "x" }; };
  await assert.rejects(saveCaseImage(db, dataDir, { ...upload, caseId: "CASE-missing" }, new Date(), spy), CaseNotFoundError);
  assert.equal(called, false);
  assert.deepEqual(objectFiles(), []);
});

test("migration: a Phase 3 database gains the columns and its old images are never served", () => {
  const dataDir = fs.mkdtempSync(path.join(workDir, "legacy-"));
  const legacy = new DatabaseSync(path.join(dataDir, "triptrace.sqlite"));
  legacy.exec(`
    CREATE TABLE trips (trip_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE cases (case_id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, status TEXT NOT NULL, source_type TEXT NOT NULL, privacy TEXT NOT NULL DEFAULT 'not_started', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE images (image_id TEXT PRIMARY KEY, case_id TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, uploaded_at TEXT NOT NULL);
    INSERT INTO trips VALUES ('TRIP-20260101-AAAA', '2026-01-01T00:00:00Z');
    INSERT INTO cases VALUES ('CASE-old', 'TRIP-20260101-AAAA', 'detected', 'detection', 'not_started', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    INSERT INTO images VALUES ('IMAGE-old', 'CASE-old', 'image/jpeg', 10, 'abc', '11111111-1111-1111-1111-111111111111', '2026-01-01T00:00:00Z');
  `);
  legacy.close();
  const db = openDatabase(dataDir);
  assert.equal(db.prepare("SELECT redaction_status AS s FROM images WHERE image_id = 'IMAGE-old'").get().s, "not_started");
  assert.equal(getServableImage(db, "IMAGE-old"), null);
  assert.deepEqual(listCaseImages(db, "CASE-old"), []);
  openDatabase(dataDir).close(); // a second start must not fail on the existing columns
});

test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));
