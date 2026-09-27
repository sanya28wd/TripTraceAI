"use strict";

const tripForm = document.querySelector("#trip-form");
const claimForm = document.querySelector("#claim-form");
const claimStep = document.querySelector("#claim-step");
const statusStep = document.querySelector("#status-step");
const tripError = document.querySelector("#trip-error");
const claimError = document.querySelector("#claim-error");
let selectedTrip = null;

/** @param {Response} response @returns {Promise<object>} */
const readResponse = async (response) => {
  const payload = await response.json();
  if (!response.ok && !payload.safePassengerMessage) {
    throw new Error(`Passenger request failed: HTTP ${response.status}; response: ${JSON.stringify(payload)}`);
  }
  return payload;
};

/** @param {string} responseType @returns {string} */
const responseHeading = (responseType) => {
  const headings = {
    safe_status: "Report received",
    clarification: "One more detail",
    manual_review: "Under review",
  };
  if (!Object.hasOwn(headings, responseType)) {
    throw new Error(`Unsupported passenger response type: ${responseType}`);
  }
  return headings[responseType];
};

/** @param {object} result @param {string} language @returns {void} */
const showResult = (result, language) => {
  const heading = result.responseType ? responseHeading(result.responseType) : "Trip not found";
  document.querySelector("#status-heading").textContent = heading;
  const message = document.querySelector("#status-message");
  message.textContent = result.safePassengerMessage;
  message.lang = language;
  message.dir = language === "ar" ? "rtl" : "ltr";
  const clarification = document.querySelector("#clarification");
  clarification.hidden = result.responseType !== "clarification";
  document.querySelector("#clarification-question").textContent = result.clarificationQuestion ?? "";
  document.querySelector("#review-note").hidden = result.responseType !== "manual_review";
  const reference = document.querySelector("#case-reference");
  reference.textContent = result.caseId ? `Case reference · ${result.caseId}` : "";
  reference.hidden = !result.caseId;
  statusStep.hidden = false;
  statusStep.focus();
};

document.querySelector("#trip-id").addEventListener("input", () => {
  selectedTrip = null;
  claimStep.hidden = true;
  statusStep.hidden = true;
});

tripForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const tripId = String(new FormData(tripForm).get("tripId")).trim();
  const button = tripForm.querySelector("button");
  const buttonLabel = button.querySelector("span");
  button.disabled = true;
  buttonLabel.textContent = "Checking…";
  tripError.textContent = "";
  claimStep.hidden = true;
  statusStep.hidden = true;
  selectedTrip = null;
  try {
    const response = await fetch(`/v1/mock/cases/${encodeURIComponent(tripId)}`);
    const result = await readResponse(response);
    if (!response.ok) {
      showResult(result, "en");
      return;
    }
    selectedTrip = { tripId, language: result.language };
    claimStep.hidden = false;
    document.querySelector("#description").focus();
  } catch (error) {
    console.warn("Passenger trip lookup failed", { tripId, error });
    tripError.textContent = "We couldn’t check this trip. Please try again.";
  } finally {
    button.disabled = false;
    buttonLabel.textContent = "Continue";
  }
});

claimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (selectedTrip === null) {
    throw new Error("Choose a trip before submitting a report.");
  }
  const button = claimForm.querySelector("button");
  const buttonLabel = button.querySelector("span");
  button.disabled = true;
  buttonLabel.textContent = "Submitting…";
  claimError.textContent = "";
  statusStep.hidden = true;
  try {
    const response = await fetch("/v1/mock/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId: selectedTrip.tripId,
        description: String(new FormData(claimForm).get("description")).trim(),
        language: selectedTrip.language,
      }),
    });
    const result = await readResponse(response);
    showResult(result, selectedTrip.language);
  } catch (error) {
    console.warn("Passenger claim submission failed", { tripId: selectedTrip.tripId, error });
    claimError.textContent = "We couldn’t submit this report. Please try again.";
  } finally {
    button.disabled = false;
    buttonLabel.textContent = "Submit report";
  }
});
