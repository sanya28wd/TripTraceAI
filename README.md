# TripTrace AI

TripTrace AI is a privacy-first lost-property recovery project for taxi fleets. It will help a team record possible forgotten items, receive passenger claims, and keep a clear audit history. The project uses synthetic demo data only during development.

## Current Phase 2 scope

This repository provides the shared project layout, Docker Compose, API and case-record contracts, and scripted passenger and driver prototypes. The passenger and driver screens share an in-memory mock case for the `TRIP-1001` claim-to-driver-alert demo. The driver sees one safe item summary and can record secure, no-item, or operations-help actions. Data remains synthetic.

## Not included yet

Do not add the full product, object detection, chatbot, VLM, LLM, persistent database, authentication, cloud deployment, live taxi integrations, live notifications, or real passenger data in this phase.

## Folder structure

- `web/` — passenger, driver, and operations interface work later.
- `api/` — backend service work later. It currently has only the health endpoint.
- `ml/` — future privacy-redaction, detection, VLM, and evaluation work.
- `docs/` — shared documentation, API contract, and safe example data.
- `data/` — empty, Git-kept folders for approved staged data, development data, held-out data, and labels.
- `infra/` — Docker-related files later.

## Start locally

You need Docker Desktop running. From the project root, run:

```bash
docker compose up --build
```

Then check the API in a second terminal:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

For the passenger prototype, retrieve a scripted case:

```bash
curl http://localhost:8000/v1/mock/cases/TRIP-1002
```

Run the API verification from the `api/` folder:

```bash
npm run verify
```

The passenger app is available at `http://localhost:8080/passenger/` (the root redirects there). The driver app is at `http://localhost:8080/driver/`. Submit the `TRIP-1001` passenger report, then open or refresh the driver inbox; it does not ask for a Trip ID. Stop both services with `docker compose down`.

Run the mock-data and transition smoke check with:

```bash
node web/smoke-test.js
```

## Team Git rules

- Use one branch per task.
- Open a pull request and get review before merging.
- Do not commit staged images containing real personal data. Use only approved synthetic or consented staged material in later phases.

## Shared contracts

Read [the API contract](docs/api-contract.md), [the case schema](docs/case-schema.md), and [the handoff notes](docs/handoff-for-team.md) before creating screens, mock data, or labels. The fields marked stable need team agreement before changes.

Phase 0 journey references:

- [User journey](docs/user-journey.md)
- [Case states and transitions](docs/case-states.md)
- [Screen map and data boundaries](docs/screen-map.md)
- [Demo story](docs/demo-story.md)
