"use strict";

const { generateUniqueTripId } = require("./ids");

/** @typedef {import("node:sqlite").DatabaseSync} DatabaseSync */
/** @typedef {{tripId: string, createdAt: string}} Trip */

/** @param {DatabaseSync} db @param {string} tripId @returns {boolean} */
const tripExists = (db, tripId) => db.prepare("SELECT 1 FROM trips WHERE trip_id = ?").get(tripId) !== undefined;

/**
 * Creates a trip with a fresh Trip ID. The database is the source of truth for "is this ID
 * taken?", and the primary key rejects a duplicate even if that check were skipped.
 * @param {DatabaseSync} db
 * @param {Date} now
 * @returns {Trip}
 */
const createTrip = (db, now) => {
  const tripId = generateUniqueTripId((candidate) => tripExists(db, candidate), now);
  const createdAt = now.toISOString();
  db.prepare("INSERT INTO trips (trip_id, created_at) VALUES (?, ?)").run(tripId, createdAt);
  return { tripId, createdAt };
};

/** @param {DatabaseSync} db @param {string} tripId @returns {Trip|null} */
const getTrip = (db, tripId) => {
  const row = db.prepare("SELECT trip_id, created_at FROM trips WHERE trip_id = ?").get(tripId);
  if (row === undefined) return null;
  return { tripId: String(row.trip_id), createdAt: String(row.created_at) };
};

module.exports = { createTrip, getTrip, tripExists };
