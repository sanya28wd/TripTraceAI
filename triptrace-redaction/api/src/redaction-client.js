"use strict";

/**
 * Client for the privacy gateway (privacy-service/). Every image must pass through redactImage
 * before it is stored. It never throws and never returns bytes unless the gateway said
 * "passed" with a well-formed image: any outage, timeout or odd reply is a failed outcome,
 * so the caller blocks the upload (fail closed).
 */

/** @typedef {{policyVersion: string, detectors: Record<string, string>, regionCounts: Record<string, number>, regions: object[]}} RedactionReport */
/** @typedef {{status: "passed", bytes: Buffer, contentType: string, report: RedactionReport}} RedactionPassed */
/** @typedef {{status: "failed", reason: string}} RedactionFailed */
/** @typedef {(input: {bytes: Uint8Array, contentType: string}) => Promise<RedactionPassed | RedactionFailed>} RedactImage */

const allowedContentTypes = new Set(["image/jpeg", "image/png"]);
// Reasons end up in the audit log, so accept only short machine codes from the gateway.
const reasonPattern = /^[a-z_]{1,40}(:[a-z0-9_-]{1,40})?$/;

/** @param {string} reason @returns {RedactionFailed} */
const failed = (reason) => ({ status: "failed", reason });

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/** @type {RedactImage} */
const redactImage = async ({ bytes, contentType }) => {
  const baseUrl = process.env.REDACTION_URL ?? "http://privacy:8100";
  const timeoutMs = Number(process.env.REDACTION_TIMEOUT_MS ?? 20000);
  let response;
  try {
    response = await fetch(`${baseUrl}/v1/redact`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return failed("redaction_unavailable");
  }
  /** @type {unknown} */ let payload;
  try {
    payload = await response.json();
  } catch {
    return failed("redaction_bad_response");
  }
  if (!isObject(payload)) return failed("redaction_bad_response");
  if (!response.ok || payload.status !== "passed") {
    return failed(typeof payload.reason === "string" && reasonPattern.test(payload.reason) ? payload.reason : "redaction_failed");
  }
  if (typeof payload.imageBase64 !== "string" || typeof payload.contentType !== "string"
    || !allowedContentTypes.has(payload.contentType) || !isObject(payload.report)) {
    return failed("redaction_bad_response");
  }
  const redacted = Buffer.from(payload.imageBase64, "base64");
  if (redacted.byteLength === 0) return failed("redaction_bad_response");
  const report = /** @type {RedactionReport} */ (payload.report);
  return { status: "passed", bytes: redacted, contentType: payload.contentType, report };
};

module.exports = { redactImage };
