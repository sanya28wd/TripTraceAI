"use strict";

const { withTransaction } = require("./db");
const { newCaseId, newEventId } = require("./ids");
const { tripExists } = require("./trips-repo");

/** @typedef {import("node:sqlite").DatabaseSync} DatabaseSync */
/** @typedef {"detection" | "passenger_claim"} CaseSourceType */
/**
 * @typedef {object} StoredCase
 * @property {string} caseId
 * @property {string} tripId
 * @property {string} status
 * @property {string} sourceType
 * @property {string} privacy
 * @property {string} createdAt
 * @property {string} updatedAt
 */
/**
 * @typedef {object} AuditEvent
 * @property {string} eventId
 * @property {string} eventType
 * @property {string} occurredAt
 * @property {string} actorType
 * @property {string|null} status
 * @property {string|null} note
 * @property {Record<string, unknown>|null} details
 */

// The two documented ways a case can start (docs/case-states.md, "Start" rows).
// manual_entry exists in the schema but has no agreed starting state yet.
const caseStarts = Object.freeze({
  detection: { status: "detected", eventType: "case_created", actorType: "system", note: "Case created from a staged item image." },
  passenger_claim: { status: "claim_submitted", eventType: "claim_submitted", actorType: "passenger", note: "Synthetic passenger claim submitted without a detected case." },
});
const caseSourceTypes = Object.freeze(Object.keys(caseStarts));

/** @param {unknown} value @returns {value is CaseSourceType} */
const isCaseSourceType = (value) => typeof value === "string" && caseSourceTypes.includes(value);

class TripNotFoundError extends Error {
  /** @param {string} tripId */
  constructor(tripId) {
    super(`Trip ${tripId} does not exist.`);
    this.name = "TripNotFoundError";
  }
}

/** @param {Record<string, unknown>} row @returns {StoredCase} */
const caseFromRow = (row) => ({
  caseId: String(row.case_id),
  tripId: String(row.trip_id),
  status: String(row.status),
  sourceType: String(row.source_type),
  privacy: String(row.privacy),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

/** @param {Record<string, unknown>} row @returns {AuditEvent} */
const auditEventFromRow = (row) => ({
  eventId: String(row.event_id),
  eventType: String(row.event_type),
  occurredAt: String(row.occurred_at),
  actorType: String(row.actor_type),
  status: row.status === null ? null : String(row.status),
  note: row.note === null ? null : String(row.note),
  details: row.details_json === null ? null : JSON.parse(String(row.details_json)),
});

/**
 * Appends one audit event. Events are never updated or deleted.
 * @param {DatabaseSync} db
 * @param {{caseId: string, eventType: string, occurredAt: string, actorType: string, status?: string|null, note?: string|null, details?: Record<string, unknown>|null}} event
 * @returns {string} the new event ID
 */
const appendAuditEvent = (db, event) => {
  const eventId = newEventId();
  db.prepare(`INSERT INTO audit_events (event_id, case_id, event_type, occurred_at, actor_type, status, note, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    eventId, event.caseId, event.eventType, event.occurredAt, event.actorType,
    event.status ?? null, event.note ?? null, event.details == null ? null : JSON.stringify(event.details),
  );
  return eventId;
};

/**
 * Creates a case and its first audit event in one transaction, so a case never exists
 * without the history entry that explains how it began.
 * @param {DatabaseSync} db
 * @param {{tripId: string, sourceType: CaseSourceType}} input
 * @param {Date} [now]
 * @returns {StoredCase}
 */
const createCase = (db, { tripId, sourceType }, now = new Date()) => {
  const start = caseStarts[sourceType];
  const caseId = newCaseId();
  const occurredAt = now.toISOString();
  withTransaction(db, () => {
    if (!tripExists(db, tripId)) throw new TripNotFoundError(tripId);
    db.prepare(`INSERT INTO cases (case_id, trip_id, status, source_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(caseId, tripId, start.status, sourceType, occurredAt, occurredAt);
    appendAuditEvent(db, { caseId, eventType: start.eventType, occurredAt, actorType: start.actorType, status: start.status, note: start.note });
  });
  const created = getCase(db, caseId);
  if (created === null) throw new Error(`Case ${caseId} was not stored.`);
  return created;
};

/** @param {DatabaseSync} db @param {string} caseId @returns {StoredCase|null} */
const getCase = (db, caseId) => {
  const row = db.prepare("SELECT * FROM cases WHERE case_id = ?").get(caseId);
  return row === undefined ? null : caseFromRow(row);
};

/**
 * Oldest first. Events written in the same millisecond keep the order they were inserted
 * (rowid), so the history never reshuffles between requests.
 * @param {DatabaseSync} db
 * @param {string} caseId
 * @returns {AuditEvent[]}
 */
const listAuditEvents = (db, caseId) => db
  .prepare("SELECT * FROM audit_events WHERE case_id = ? ORDER BY occurred_at, rowid")
  .all(caseId)
  .map(auditEventFromRow);

/**
 * Event shape used by docs/example-case.json and the mock API: optional fields are left out
 * instead of being sent as null, so existing timeline UI code reads real and mock data alike.
 * @param {AuditEvent} event
 * @returns {Record<string, unknown>}
 */
const timelineEventView = ({ status, note, details, ...required }) => ({
  ...required,
  ...(status === null ? {} : { status }),
  ...(note === null ? {} : { note }),
  ...(details === null ? {} : { details }),
});

/**
 * The full, append-only history of one case. This is an operations view: passenger screens
 * must not show it.
 * @param {DatabaseSync} db
 * @param {string} caseId
 * @returns {{caseId: string, tripId: string, status: string, auditTimeline: Record<string, unknown>[]}|null}
 */
const getCaseTimeline = (db, caseId) => {
  const storedCase = getCase(db, caseId);
  if (storedCase === null) return null;
  return {
    caseId: storedCase.caseId,
    tripId: storedCase.tripId,
    status: storedCase.status,
    auditTimeline: listAuditEvents(db, caseId).map(timelineEventView),
  };
};

module.exports = { appendAuditEvent, caseSourceTypes, createCase, getCase, getCaseTimeline, isCaseSourceType, listAuditEvents, TripNotFoundError };
