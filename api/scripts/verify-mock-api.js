"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const apiDirectory = path.join(__dirname, "..");
const server = spawn(process.execPath, ["src/server.js"], {
  cwd: apiDirectory,
  stdio: "ignore",
});

const fail = (message) => {
  server.kill();
  throw new Error(message);
};

const verify = async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const health = await fetch("http://127.0.0.1:8000/health");
  if (!health.ok || (await health.json()).status !== "ok") fail("Health check failed.");

  const clarification = await fetch("http://127.0.0.1:8000/v1/mock/cases/TRIP-1002");
  if (!clarification.ok || (await clarification.json()).responseType !== "clarification") fail("Clarification flow failed.");

  const sensitive = await fetch("http://127.0.0.1:8000/v1/mock/cases/TRIP-1003");
  if (!sensitive.ok || (await sensitive.json()).status !== "manual_review") fail("Manual-review flow failed.");

  const unknown = await fetch("http://127.0.0.1:8000/v1/mock/cases/TRIP-9999");
  if (unknown.status !== 404 || (await unknown.json()).error !== "trip_not_found") fail("Unknown Trip ID flow failed.");

  server.kill();
  console.log("Mock API verification passed.");
};

verify().catch((error) => {
  server.kill();
  console.error(error.message);
  process.exitCode = 1;
});
