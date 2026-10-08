"use strict";

const { randomInt, randomUUID } = require("node:crypto");

// No 0/O, 1/I/L lookalikes, so IDs can be read aloud or typed from a screenshot.
const tripIdAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const tripIdSuffixLength = 4;
const tripIdPattern = /^TRIP-\d{8}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

/** @param {Date} date @returns {string} */
const utcDateStamp = (date) => date.toISOString().slice(0, 10).replaceAll("-", "");

const maxTripIdAttempts = 10;

/**
 * Synthetic Trip ID such as TRIP-20261008-7K3F. The UTC date makes IDs easy to sort and
 * read; the random suffix makes them unguessable. 31^4 ≈ 923k suffixes per day means
 * collisions are likely after about 1,000 IDs (birthday paradox), so callers that need
 * uniqueness must use generateUniqueTripId.
 * @param {Date} [now]
 * @returns {string}
 */
const newTripId = (now = new Date()) => {
  let suffix = "";
  for (let index = 0; index < tripIdSuffixLength; index += 1) {
    suffix += tripIdAlphabet[randomInt(tripIdAlphabet.length)];
  }
  return `TRIP-${utcDateStamp(now)}-${suffix}`;
};

/**
 * Generates Trip IDs until one is not taken. isTaken is backed by an in-memory Set for now
 * and by the trips table primary key from Phase 3 Step 2.
 * @param {(tripId: string) => boolean} isTaken
 * @param {Date} [now]
 * @returns {string}
 */
const generateUniqueTripId = (isTaken, now = new Date()) => {
  for (let attempt = 0; attempt < maxTripIdAttempts; attempt += 1) {
    const tripId = newTripId(now);
    if (!isTaken(tripId)) return tripId;
  }
  throw new Error(`Could not generate an unused Trip ID after ${maxTripIdAttempts} attempts.`);
};

/** @param {string} value @returns {boolean} */
const isTripId = (value) => tripIdPattern.test(value);

/** @returns {string} */
const newCaseId = () => `CASE-${randomUUID()}`;

/** @returns {string} */
const newEventId = () => `EVENT-${randomUUID()}`;

/** @returns {string} */
const newImageId = () => `IMAGE-${randomUUID()}`;

module.exports = { generateUniqueTripId, isTripId, newCaseId, newEventId, newImageId, newTripId, tripIdAlphabet };
