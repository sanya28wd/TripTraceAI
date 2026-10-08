"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const objectsDirectoryName = "objects";
// Keys are always server-generated UUIDs, so anything else (like "../triptrace.sqlite") is rejected.
const storageKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @typedef {{storageKey: string, sha256: string, sizeBytes: number}} StoredObject */

/** @param {string} dataDir @returns {string} */
const objectsDirectory = (dataDir) => path.join(dataDir, objectsDirectoryName);

/** @param {Uint8Array} bytes @returns {string} */
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Resolves where an object lives on disk. Throws for any key the store did not generate,
 * so a caller can never be tricked into reading a file outside the objects folder.
 * @param {string} dataDir
 * @param {string} storageKey
 * @returns {string}
 */
const getObjectPath = (dataDir, storageKey) => {
  if (!storageKeyPattern.test(storageKey)) throw new Error("Invalid storage key.");
  return path.join(objectsDirectory(dataDir), storageKey);
};

/**
 * Saves bytes under a new random key. The bytes go to a temporary file first, are flushed to
 * disk, and only then renamed into place. A rename is atomic, so a crash leaves either no
 * object or the complete object, never a half-written image. The uploader's file name is
 * never used: it is untrusted input and may contain personal information.
 * @param {string} dataDir
 * @param {Uint8Array} bytes
 * @returns {Promise<StoredObject>}
 */
const putObject = async (dataDir, bytes) => {
  const directory = objectsDirectory(dataDir);
  await fs.mkdir(directory, { recursive: true });
  const storageKey = randomUUID();
  const finalPath = getObjectPath(dataDir, storageKey);
  // Same folder as the final file, so the rename never crosses file systems.
  const tempPath = path.join(directory, `.tmp-${storageKey}`);
  try {
    const handle = await fs.open(tempPath, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tempPath, finalPath);
  } catch (error) {
    try {
      await fs.rm(tempPath, { force: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Operation failed and cleanup also failed.");
    }
    throw error;
  }
  return { storageKey, sha256: sha256Hex(bytes), sizeBytes: bytes.byteLength };
};

/** @param {string} dataDir @param {string} storageKey @returns {Promise<Buffer>} */
const readObject = (dataDir, storageKey) => fs.readFile(getObjectPath(dataDir, storageKey));

/**
 * Removes an object. Used to clean up when the database write that should accompany an
 * upload fails, so no file is left without a record.
 * @param {string} dataDir
 * @param {string} storageKey
 * @returns {Promise<void>}
 */
const deleteObject = (dataDir, storageKey) => fs.rm(getObjectPath(dataDir, storageKey), { force: true });

module.exports = { deleteObject, getObjectPath, objectsDirectoryName, putObject, readObject, sha256Hex };
