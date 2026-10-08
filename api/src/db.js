"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databaseFileName = "triptrace.sqlite";

// IF NOT EXISTS makes startup safe to repeat: the first start creates the tables, later
// starts keep the existing rows. Field names mirror docs/case-schema.md.
const schema = `
CREATE TABLE IF NOT EXISTS trips (
  trip_id     TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  case_id      TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(trip_id),
  status       TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('detection', 'passenger_claim', 'manual_entry')),
  privacy      TEXT NOT NULL DEFAULT 'not_started',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cases_by_trip ON cases(trip_id);

CREATE TABLE IF NOT EXISTS images (
  image_id      TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES cases(case_id),
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  storage_key   TEXT NOT NULL UNIQUE,
  uploaded_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_by_case ON images(case_id);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id      TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES cases(case_id),
  event_type    TEXT NOT NULL,
  occurred_at   TEXT NOT NULL,
  actor_type    TEXT NOT NULL,
  status        TEXT,
  note          TEXT,
  details_json  TEXT
);
CREATE INDEX IF NOT EXISTS audit_events_by_case ON audit_events(case_id, occurred_at);
`;

/**
 * Opens (creating if needed) the SQLite database inside dataDir and ensures the schema exists.
 * @param {string} dataDir
 * @returns {DatabaseSync}
 */
const openDatabase = (dataDir) => {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, databaseFileName));
  // SQLite ignores REFERENCES unless this is switched on for every connection.
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(schema);
  return db;
};

/**
 * Runs work inside one transaction: every write inside it is saved together, or (if anything
 * throws) none of them are.
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} work
 * @returns {T}
 */
const withTransaction = (db, work) => {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = work();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
};

module.exports = { databaseFileName, openDatabase, withTransaction };
