"use strict";

const { withTransaction } = require("./db");
const { newImageId } = require("./ids");
const { appendAuditEvent, getCase } = require("./cases-repo");
const { deleteObject, putObject } = require("./object-store");

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

/** @param {Record<string, unknown>} row @returns {StoredImage & {storageKey: string}} */
const imageFromRow = (row) => ({
  imageId: String(row.image_id),
  caseId: String(row.case_id),
  contentType: /** @type {ImageContentType} */ (String(row.content_type)),
  sizeBytes: Number(row.size_bytes),
  sha256: String(row.sha256),
  uploadedAt: String(row.uploaded_at),
  url: `/v1/images/${String(row.image_id)}`,
  storageKey: String(row.storage_key),
});

/** @param {StoredImage & {storageKey: string}} image @returns {StoredImage} */
const publicImage = ({ storageKey, ...image }) => image;

/**
 * Stores an already-validated image for a case: the file first, then the image row and an
 * image_uploaded audit event in one transaction. If the database write fails, the file is
 * deleted again, so a file never exists without its record.
 * @param {DatabaseSync} db
 * @param {string} dataDir
 * @param {{caseId: string, contentType: ImageContentType, bytes: Uint8Array}} upload
 * @param {Date} [now]
 * @returns {Promise<StoredImage>}
 */
const saveCaseImage = async (db, dataDir, { caseId, contentType, bytes }, now = new Date()) => {
  const stored = await putObject(dataDir, bytes);
  const imageId = newImageId();
  const uploadedAt = now.toISOString();
  try {
    withTransaction(db, () => {
      if (getCase(db, caseId) === null) throw new CaseNotFoundError(caseId);
      db.prepare(`INSERT INTO images (image_id, case_id, content_type, size_bytes, sha256, storage_key, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(imageId, caseId, contentType, stored.sizeBytes, stored.sha256, stored.storageKey, uploadedAt);
      db.prepare("UPDATE cases SET updated_at = ? WHERE case_id = ?").run(uploadedAt, caseId);
      // Details hold only what identifies the stored bytes: no file name, no personal data.
      appendAuditEvent(db, {
        caseId,
        eventType: "image_uploaded",
        occurredAt: uploadedAt,
        actorType: "system",
        note: "Staged item image stored.",
        details: { imageId, contentType, sizeBytes: stored.sizeBytes, sha256: stored.sha256 },
      });
    });
  } catch (error) {
    await deleteObject(dataDir, stored.storageKey);
    throw error;
  }
  return { imageId, caseId, contentType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, uploadedAt, url: `/v1/images/${imageId}` };
};

/** @param {DatabaseSync} db @param {string} imageId @returns {(StoredImage & {storageKey: string})|null} */
const getImage = (db, imageId) => {
  const row = db.prepare("SELECT * FROM images WHERE image_id = ?").get(imageId);
  return row === undefined ? null : imageFromRow(row);
};

/** @param {DatabaseSync} db @param {string} caseId @returns {StoredImage[]} */
const listCaseImages = (db, caseId) => db
  .prepare("SELECT * FROM images WHERE case_id = ? ORDER BY uploaded_at, rowid")
  .all(caseId)
  .map((row) => publicImage(imageFromRow(row)));

module.exports = { bytesMatchContentType, CaseNotFoundError, getImage, imageContentTypes, isImageContentType, listCaseImages, maxImageBytes, saveCaseImage };
