"use strict";

const { withTransaction } = require("./db");
const { newImageId } = require("./ids");
const { appendAuditEvent, getCase } = require("./cases-repo");
const { deleteObject, putObject } = require("./object-store");
const { redactImage } = require("./redaction-client");

/** @typedef {import("node:sqlite").DatabaseSync} DatabaseSync */
/** @typedef {"image/jpeg" | "image/png"} ImageContentType */
/**
 * @typedef {object} StoredImage
 * @property {string} imageId
 * @property {string} caseId
 * @property {ImageContentType} contentType
 * @property {number} sizeBytes
 * @property {string} sha256
 * @property {string} uploadedAt
 * @property {string} url
 */

const maxImageBytes = 5 * 1024 * 1024;

// The first bytes of a file reveal its real type, whatever the Content-Type header claims.
const imageSignatures = Object.freeze({
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
});
const imageContentTypes = Object.freeze(Object.keys(imageSignatures));

/** @param {unknown} value @returns {value is ImageContentType} */
const isImageContentType = (value) => typeof value === "string" && imageContentTypes.includes(value);

/** @param {Uint8Array} bytes @param {ImageContentType} contentType @returns {boolean} */
const bytesMatchContentType = (bytes, contentType) => {
  const signature = imageSignatures[contentType];
  return bytes.byteLength > signature.length && signature.every((byte, index) => bytes[index] === byte);
};

class CaseNotFoundError extends Error {
  /** @param {string} caseId */
  constructor(caseId) {
    super(`Case ${caseId} does not exist.`);
    this.name = "CaseNotFoundError";
  }
}

/**
 * Thrown when the privacy gateway did not return a redacted image. Nothing was stored; the
 * block is already recorded in the audit timeline when this is thrown.
 */
class PrivacyBlockedError extends Error {
  /** @param {string} reason machine code, e.g. "redaction_unavailable" or "detector_error:face" */
  constructor(reason) {
    super(`Image blocked by the privacy gateway: ${reason}.`);
    this.name = "PrivacyBlockedError";
    this.reason = reason;
    /** True when the gateway could not be reached or answered badly, so a retry may work. */
    this.unavailable = reason.startsWith("redaction_") || reason === "detectors_not_ready";
  }
}

/** @param {Record<string, unknown>} row @returns {StoredImage & {storageKey: string, redactionStatus: string}} */
const imageFromRow = (row) => ({
  imageId: String(row.image_id),
  caseId: String(row.case_id),
  contentType: /** @type {ImageContentType} */ (String(row.content_type)),
  sizeBytes: Number(row.size_bytes),
  sha256: String(row.sha256),
  uploadedAt: String(row.uploaded_at),
  url: `/v1/images/${String(row.image_id)}`,
  storageKey: String(row.storage_key),
  redactionStatus: String(row.redaction_status),
});

/** @param {StoredImage & {storageKey: string, redactionStatus: string}} image @returns {StoredImage} */
const publicImage = ({ storageKey, redactionStatus, ...image }) => image;

/**
 * Records that an upload was refused: the case's privacy state becomes "failed", a detected case
 * moves to manual_review (it must not reach a driver without safe evidence), and the reason goes
 * into the audit timeline. No image row or file exists for the refused upload.
 * @param {DatabaseSync} db
 * @param {string} caseId
 * @param {string} reason
 * @param {Date} now
 * @returns {void}
 */
const recordPrivacyBlock = (db, caseId, reason, now) => {
  const occurredAt = now.toISOString();
  withTransaction(db, () => {
    const current = getCase(db, caseId);
    if (current === null) throw new CaseNotFoundError(caseId);
    const moveToReview = current.status === "detected";
    db.prepare("UPDATE cases SET privacy = 'failed', status = ?, updated_at = ? WHERE case_id = ?")
      .run(moveToReview ? "manual_review" : current.status, occurredAt, caseId);
    appendAuditEvent(db, {
      caseId, eventType: "privacy_check_failed", occurredAt, actorType: "system",
      note: "Image was not stored because privacy redaction did not complete.", details: { reason },
    });
    if (moveToReview) {
      appendAuditEvent(db, {
        caseId, eventType: "manual_review_requested", occurredAt, actorType: "system", status: "manual_review",
        note: "Privacy redaction failed; operations review needed.", details: { reason: "privacy_blocked" },
      });
    }
  });
};

/**
 * Redacts and stores an already-validated image for a case. Order is fixed: redact in memory,
 * then write the REDACTED bytes, then the image row and audit events in one transaction. The
 * original bytes are never written anywhere. If redaction fails, nothing is stored, the block is
 * recorded, and PrivacyBlockedError is thrown. If the database write fails, the file is deleted.
 * @param {DatabaseSync} db
 * @param {string} dataDir
 * @param {{caseId: string, contentType: ImageContentType, bytes: Uint8Array}} upload
 * @param {Date} now
 * @param {import("./redaction-client").RedactImage} [redact] injectable for tests
 * @returns {Promise<StoredImage>}
 */
const saveCaseImage = async (db, dataDir, { caseId, contentType, bytes }, now, redact = redactImage) => {
  if (getCase(db, caseId) === null) throw new CaseNotFoundError(caseId);

  const outcome = await redact({ bytes, contentType });
  if (outcome.status !== "passed") {
    recordPrivacyBlock(db, caseId, outcome.reason, now);
    throw new PrivacyBlockedError(outcome.reason);
  }
  // Defence in depth: do not store anything that is not a JPEG/PNG the gateway claims it is.
  if (!isImageContentType(outcome.contentType) || !bytesMatchContentType(outcome.bytes, outcome.contentType)) {
    recordPrivacyBlock(db, caseId, "redaction_bad_response", now);
    throw new PrivacyBlockedError("redaction_bad_response");
  }
  const { report } = outcome;
  const storedContentType = outcome.contentType;

  const stored = await putObject(dataDir, outcome.bytes);
  const imageId = newImageId();
  const uploadedAt = now.toISOString();
  try {
    withTransaction(db, () => {
      if (getCase(db, caseId) === null) throw new CaseNotFoundError(caseId);
      db.prepare(`INSERT INTO images (image_id, case_id, content_type, size_bytes, sha256, storage_key, uploaded_at, redaction_status, redaction_report_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'passed', ?)`).run(
        imageId, caseId, storedContentType, stored.sizeBytes, stored.sha256, stored.storageKey, uploadedAt, JSON.stringify(report),
      );
      db.prepare("UPDATE cases SET privacy = 'passed', updated_at = ? WHERE case_id = ?").run(uploadedAt, caseId);
      // Audit details: model versions and region counts only. No pixels, no file name, no boxes.
      appendAuditEvent(db, {
        caseId, eventType: "redaction_passed", occurredAt: uploadedAt, actorType: "system",
        note: "Sensitive regions were redacted before storage.",
        details: { imageId, policyVersion: report.policyVersion, detectors: report.detectors, regionCounts: report.regionCounts },
      });
      appendAuditEvent(db, {
        caseId, eventType: "image_uploaded", occurredAt: uploadedAt, actorType: "system",
        note: "Redacted staged item image stored.",
        details: { imageId, contentType: storedContentType, sizeBytes: stored.sizeBytes, sha256: stored.sha256 },
      });
    });
  } catch (error) {
    try {
      await deleteObject(dataDir, stored.storageKey);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Operation failed and cleanup also failed.");
    }
    throw error;
  }
  return { imageId, caseId, contentType: storedContentType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, uploadedAt, url: `/v1/images/${imageId}` };
};

/**
 * The only way the API should look up an image to serve it: returns null unless redaction passed,
 * so legacy rows and anything unredacted can never reach a browser.
 * @param {DatabaseSync} db @param {string} imageId @returns {(StoredImage & {storageKey: string})|null}
 */
const getServableImage = (db, imageId) => {
  const row = db.prepare("SELECT * FROM images WHERE image_id = ? AND redaction_status = 'passed'").get(imageId);
  if (row === undefined) return null;
  const { redactionStatus, ...image } = imageFromRow(row);
  return image;
};

/** Only redacted images are listed, so no URL to an unredacted image is ever handed out.
 * @param {DatabaseSync} db @param {string} caseId @returns {StoredImage[]} */
const listCaseImages = (db, caseId) => db
  .prepare("SELECT * FROM images WHERE case_id = ? AND redaction_status = 'passed' ORDER BY uploaded_at, rowid")
  .all(caseId)
  .map((row) => publicImage(imageFromRow(row)));

module.exports = {
  bytesMatchContentType, CaseNotFoundError, getServableImage, imageContentTypes, isImageContentType,
  listCaseImages, maxImageBytes, PrivacyBlockedError, saveCaseImage,
};
