"use strict";

const POLL_INTERVAL_MS = 15000;
const alertList = document.querySelector("#alert-list");
const emptyState = document.querySelector("#driver-empty");
const detail = document.querySelector("#alert-detail");
const detailActions = document.querySelector("#detail-actions");
const errorMessage = document.querySelector("#driver-error");
const filterButtons = [...document.querySelectorAll(".alert-filters button")];
let alerts = [];
let activeFilter = "all";
let selectedAlertId = null;
let previousUnreadCount = 0;

const displayValue = (value) => String(value).replaceAll("_", " ");
const formatTime = (value) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
const filterAlerts = () => activeFilter === "all" ? alerts : alerts.filter((alert) => alert.alertStatus === activeFilter);
const statusLabel = (status) => ({ new: "New", in_progress: "In progress", completed: "Completed" })[status] ?? "Updated";

const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : `HTTP ${response.status}`);
  return payload;
};

const setCounts = () => {
  const counts = { all: alerts.length, new: 0, in_progress: 0, completed: 0 };
  alerts.forEach((alert) => { counts[alert.alertStatus] += 1; });
  document.querySelector("#count-all").textContent = String(counts.all);
  document.querySelector("#count-new").textContent = String(counts.new);
  document.querySelector("#count-in-progress").textContent = String(counts.in_progress);
  document.querySelector("#count-completed").textContent = String(counts.completed);
};

const renderInbox = () => {
  const visibleAlerts = filterAlerts();
  alertList.replaceChildren(...visibleAlerts.map((alert) => {
    const card = document.createElement("article");
    card.className = `driver-alert-row ${alert.alertStatus === "new" ? "is-unread" : ""}`;
    card.innerHTML = `<img src="${alert.detectedItem.imageUrl}" alt="${alert.detectedItem.imageAlt}">
      <div class="alert-row-main"><div class="alert-row-meta"><span class="alert-state">${statusLabel(alert.alertStatus)}</span><time>${formatTime(alert.createdAt)}</time></div>
      <h2>${displayValue(alert.detectedItem.category)}</h2><p>${displayValue(alert.detectedItem.colour)} · ${displayValue(alert.detectedItem.seatAreaHint)}</p>
      <small>Trip ${alert.tripId} · ${alert.caseId}</small></div>
      <button type="button" data-alert-id="${alert.alertId}">Review alert</button>`;
    return card;
  }));
  emptyState.hidden = visibleAlerts.length !== 0;
  setCounts();
};

const showNewBanner = (unreadCount) => {
  if (unreadCount <= previousUnreadCount) return;
  const newCount = unreadCount - previousUnreadCount;
  document.querySelector("#new-alert-message").textContent = `${newCount} new item ${newCount === 1 ? "alert is" : "alerts are"} assigned to your vehicle.`;
  document.querySelector("#new-alert-banner").hidden = false;
};

const loadSession = async () => {
  const session = await requestJson("/v1/mock/driver/session");
  document.querySelector("#driver-name").textContent = session.driver.name;
  document.querySelector("#vehicle-label").textContent = session.vehicle.label;
};

const loadAlerts = async () => {
  const payload = await requestJson("/v1/mock/driver/alerts");
  alerts = payload.alerts;
  const unreadCount = alerts.filter((alert) => alert.readAt === null).length;
  showNewBanner(unreadCount);
  previousUnreadCount = unreadCount;
  renderInbox();
};

const renderDetail = (alert) => {
  selectedAlertId = alert.alertId;
  document.querySelector("#detail-state").textContent = statusLabel(alert.alertStatus);
  document.querySelector("#detail-time").textContent = `Alerted ${formatTime(alert.createdAt)}`;
  document.querySelector("#detail-trip").textContent = `Trip ${alert.tripId} · ${alert.caseId}`;
  document.querySelector("#alert-detail-heading").textContent = `${displayValue(alert.detectedItem.colour)} ${displayValue(alert.detectedItem.category)}`;
  document.querySelector("#detail-image").src = alert.detectedItem.imageUrl;
  document.querySelector("#detail-image").alt = alert.detectedItem.imageAlt;
  document.querySelector("#detail-colour").textContent = displayValue(alert.detectedItem.colour);
  document.querySelector("#detail-seat").textContent = displayValue(alert.detectedItem.seatAreaHint);
  document.querySelector("#detail-case").textContent = alert.caseId;
  const actionAvailable = alert.allowedActions.length > 0;
  detailActions.hidden = !actionAvailable;
  const outcome = document.querySelector("#detail-outcome");
  outcome.hidden = actionAvailable;
  outcome.textContent = alert.outcomeMessage ?? "This alert is complete.";
  detail.hidden = false;
  detail.focus();
};

const openAlert = async (alertId) => {
  const alert = await requestJson(`/v1/mock/driver/alerts/${encodeURIComponent(alertId)}`);
  if (alert.readAt === null) await requestJson(`/v1/mock/driver/alerts/${encodeURIComponent(alertId)}/read`, { method: "POST" });
  await loadAlerts();
  const updatedAlert = alerts.find((candidate) => candidate.alertId === alertId);
  if (updatedAlert === undefined) throw new Error("The selected alert is no longer available.");
  renderDetail(updatedAlert);
};

const runAction = async (action) => {
  if (selectedAlertId === null) throw new Error("Open an alert before recording an action.");
  detailActions.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  const alert = await requestJson(`/v1/mock/driver/alerts/${encodeURIComponent(selectedAlertId)}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  await loadAlerts();
  renderDetail(alert);
};

alertList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-alert-id]");
  if (button === null) return;
  openAlert(button.dataset.alertId).catch((error) => { errorMessage.textContent = `We couldn’t open this alert: ${error.message}`; });
});

detailActions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button === null) return;
  runAction(button.dataset.action).catch((error) => { errorMessage.textContent = `We couldn’t save this update: ${error.message}`; });
});

filterButtons.forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  filterButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  renderInbox();
}));

document.querySelector("#refresh-alerts").addEventListener("click", () => loadAlerts().catch((error) => { errorMessage.textContent = `We couldn’t refresh alerts: ${error.message}`; }));
document.querySelector("#close-detail").addEventListener("click", () => { detail.hidden = true; selectedAlertId = null; });

Promise.all([loadSession(), loadAlerts()]).catch((error) => { errorMessage.textContent = `We couldn’t load your driver inbox: ${error.message}`; });
window.setInterval(() => loadAlerts().catch((error) => { errorMessage.textContent = `We couldn’t refresh alerts: ${error.message}`; }), POLL_INTERVAL_MS);
