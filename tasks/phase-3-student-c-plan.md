# Phase 3 — Student C Plan: Backend Foundation and Image Upload

Goal from the guide: *a local application can create a Trip ID, upload a staged image, store a case, and show its audit timeline — and the same case is still there after restarting.*

## Status (2026-10-08)

| Step | Status |
| --- | --- |
| 0–6 | Done. `cd api && npm run verify:real` passes (19 checks, including a server restart). |
| 7 | Done: the Docker volume (verified across 3 rounds of `docker compose down`/`up` through nginx), the nginx upload limit, the nginx startup order, the API docs and the team handoff. **The "pair with A" switch of one mock flow is handed to Student A**, using [docs/handoff-for-team.md](../docs/handoff-for-team.md). |

Work through the steps in order. Each step is small, ends with something you can run and see, and builds on the previous one. Do not start the next step until the "Done when" line is true.

## Key decisions (made up front so every step agrees)

| Decision | Choice | Why |
| --- | --- | --- |
| Database | SQLite through Node's built-in `node:sqlite` | No new dependencies, a single file on disk, and it survives restarts. The API currently has zero npm packages, and this keeps it that way. |
| Object storage | A local folder (`api/storage/objects/`) holding files named by their ID | This is the "local object storage" the guide asks for. Cloud storage is explicitly out of scope. |
| Upload format | The raw image bytes as the request body (`Content-Type: image/jpeg` or `image/png`) | Avoids writing or installing a multipart parser. One image per request. |
| Where data lives | A `DATA_DIR` env var (default `api/storage/`), gitignored, mounted as a Docker volume | Real case data must never be committed, and the Docker container must keep it across restarts. |
| Existing mock routes | Keep `/v1/mock/*` exactly as they are. Add the new real routes under `/v1/` | Student A's screens keep working while you build. One flow is switched over at the end (Step 7). |
| Code layout | Split new code into small modules in `api/src/` | `server.js` is already about 300 lines. Separate files make each step easy to understand on its own. |

Target file layout at the end:

```text
api/src/
  server.js        ← routes only (existing file, gains new routes)
  ids.js           ← Step 1: Trip ID / case ID / event ID generation
  db.js            ← Step 2: open SQLite, create tables
  cases-repo.js    ← Step 3: insert/read cases and audit events
  object-store.js  ← Step 4: save/read image files on disk
api/scripts/
  verify-real-api.js  ← grows a little in every step
```

---

## Step 0 — Setup: Node 22

`node:sqlite` needs Node 22.5 or newer, and `api/package.json` already declares `>=22`. Check with `node --version`. If you're on 20, install 22 (for example, `nvm install 22 && nvm use 22`, or `brew install node@22`). The Docker image (`node:22-alpine`) is already fine.

**Done when:** `node -e "require('node:sqlite'); console.log('ok')"` prints `ok`.

---

## Step 1 — Trip ID generation

**Concept:** an ID scheme that is synthetic, unique, readable, and clearly fake, so nobody mistakes it for a real taxi trip.

**Build**
- `api/src/ids.js` exports `newTripId()`, `newCaseId()` and `newEventId()`.
- Trip ID format: `TRIP-YYYYMMDD-XXXX`, where `XXXX` is 4 characters from an alphabet without lookalikes (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`: no 0/O, 1/I/L lookalikes). Use `crypto.randomInt`.
- Case and event IDs can use `CASE-${randomUUID()}` and `EVENT-${randomUUID()}`.
- Add one route: `POST /v1/trips` returns `201 { tripId, createdAt }`. It is not saved yet; that comes in Step 2.

**Check it:** `curl -X POST localhost:8000/v1/trips` returns a new, well-formed ID each time.

**Done when:** a script that generates 1,000 IDs finds that all of them match the regex and none are duplicates.

**You'll understand:** why IDs are generated on the server, and why random IDs beat sequential ones (they don't leak how many trips exist).

---

## Step 2 — Database schema

**Concept:** move from "data in a JavaScript array" to "data in a file that outlives the process."

**Build**
- `api/src/db.js` exports `openDatabase(dataDir)`, which opens `${dataDir}/triptrace.sqlite` and runs `CREATE TABLE IF NOT EXISTS` for:

```sql
trips (
  trip_id     TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL
);
cases (
  case_id      TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(trip_id),
  status       TEXT NOT NULL,
  source_type  TEXT NOT NULL,          -- detection | passenger_claim | manual_entry
  privacy      TEXT NOT NULL DEFAULT 'not_started',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
images (
  image_id      TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES cases(case_id),
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  storage_key   TEXT NOT NULL,          -- file name inside object storage
  uploaded_at   TEXT NOT NULL
);
audit_events (
  event_id     TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES cases(case_id),
  event_type   TEXT NOT NULL,
  occurred_at  TEXT NOT NULL,
  actor_type   TEXT NOT NULL,
  status       TEXT,
  note         TEXT,
  details_json TEXT
);
```

- The field names mirror [docs/case-schema.md](../docs/case-schema.md), so check it before you rename anything.
- `POST /v1/trips` now inserts a row.
- Add `api/storage/` to `.gitignore`.

**Check it:** create a trip, stop the server, start it again, and query `sqlite3 api/storage/triptrace.sqlite "select * from trips"`. The row is still there.

**Done when:** the tables are created automatically on first start, and a second start doesn't fail or wipe them.

**You'll understand:** tables, primary keys, foreign keys, why `IF NOT EXISTS` makes startup safe to repeat, and why timestamps are stored as ISO UTC strings.

---

## Step 3 — Store a case (with its first audit entry)

**Concept:** a case and its audit event are written **together**. Either both are saved or neither is, which is what a transaction gives you.

**Build**
- `api/src/cases-repo.js` exports `createCase(db, { tripId, sourceType })`, `getCase(db, caseId)` and `listAuditEvents(db, caseId)`.
- `createCase` runs one transaction that inserts the `cases` row and a `case_created` audit event.
- Routes:
  - `POST /v1/cases` with body `{ "tripId": "...", "sourceType": "detection" }` returns `201` with the case. It returns `404` if the trip doesn't exist and `400` if `sourceType` is not `detection` or `passenger_claim` (the two documented starts in `docs/case-states.md`).
  - `GET /v1/cases/:caseId` returns the case, or `404`.

**Check it:** create a trip, then a case, restart the server, and `GET` the case again.

**Done when:** the case survives a restart, and a bad `tripId` leaves **no** half-written rows.

**You'll understand:** transactions, validating input before writing, and status codes (201, 400, 404).

---

## Step 4 — Local object storage

**Concept:** databases hold metadata, while files hold bytes. Keep them separate.

**Build**
- `api/src/object-store.js` exports `putObject(dataDir, bytes)`, which returns `{ storageKey, sha256, sizeBytes }`, and `getObjectPath(dataDir, storageKey)`.
- Files go into `${dataDir}/objects/<storageKey>`. The `storageKey` is a fresh random ID, **never** the uploaded file name, which prevents path tricks and leaks.
- Write to a temporary file and then `rename`, so a crash never leaves a half-written image.

**Check it:** a small script saves a buffer, reads it back, and confirms the bytes and the sha256 match.

**Done when:** objects round-trip correctly and the original file name is stored nowhere.

**You'll understand:** content hashing for integrity, atomic writes, and why user-supplied file names are untrusted.

---

## Step 5 — Upload endpoint

**Concept:** combine Steps 3 and 4. Receive bytes, validate them, store the file, record metadata, and add an audit entry.

**Build**
- `POST /v1/cases/:caseId/images` with the raw body and `Content-Type: image/jpeg|image/png`.
- Validate **before** saving:
  - The case exists (otherwise `404`).
  - The content type is allowed **and** the first bytes match it. JPEG starts `FF D8 FF` and PNG starts `89 50 4E 47`. Otherwise return `415`.
  - The size is at most 5 MB. Stop reading once the limit is exceeded and return `413`.
- Then `putObject`, and in one transaction insert the `images` row and an `image_uploaded` audit event. The event's `details` should include `imageId`, `sha256` and `sizeBytes`, but **no file name and no personal data**.
- `GET /v1/images/:imageId` streams the file back with its content type, which Student A needs for display.
- Error bodies should be short, safe messages that A can show directly (for example, "Only JPEG or PNG images up to 5 MB are accepted").

**Check it:**
```sh
curl -X POST --data-binary @data/staged/<some-image>.jpg \
  -H "Content-Type: image/jpeg" localhost:8000/v1/cases/<caseId>/images
```
Also try a `.txt` file renamed to `.jpg` (expect `415`) and a large file (expect `413`).

**Done when:** a staged image uploads, can be fetched back, and bad uploads are rejected without leaving files behind.

**You'll understand:** why you never trust `Content-Type` alone, how to enforce limits while streaming, and why EXIF and file names are a privacy concern (flag this to Student B for the metadata review).

---

## Step 6 — Audit timeline endpoint

**Concept:** the timeline is append-only history. You never edit or delete events, only add them.

**Build**
- `GET /v1/cases/:caseId/timeline` returns `{ caseId, tripId, status, auditTimeline: [...] }`, sorted oldest first and shaped like the existing mock `auditTimeline` (`eventId`, `eventType`, `occurredAt`, `actorType`, `status`, `note`, `details`).
- Optionally, include `images: [{ imageId, uploadedAt, url }]` in `GET /v1/cases/:caseId` so A's case-history screen needs only one call.

**Check it:** after Steps 3 and 5, the timeline shows `case_created` and then `image_uploaded`.

**Done when:** the event order is stable, and the response shape matches what the mock already returns, so A's UI code barely changes.

**You'll understand:** append-only audit logs and why keeping the same response shape as the mock makes the switchover cheap.

---

## Step 7 — Make it survive restarts, document it, hand off

**Concept:** "Done" means someone else can rely on it.

**Build**
- **Docker:** in `compose.yaml`, add a named volume for the API at `/app/storage` and set `DATA_DIR=/app/storage`. Run `docker compose down && docker compose up` and confirm the case is still there.
- **Verify script:** `api/scripts/verify-real-api.js` starts the server on a temp `DATA_DIR`, creates a trip, a case and an upload, checks the timeline, **restarts the server**, and checks everything again. Add `"verify:real"` to `package.json`.
- **Docs:** add the new endpoints to [docs/api-contract.md](../docs/api-contract.md) and [docs/openapi.yaml](../docs/openapi.yaml). This is the "C publishes stable endpoints" handoff.
- **Pair with A:** pick **one** mock flow (for example, the passenger case-status lookup) and point it at `/v1/cases/...` instead of `/v1/mock/cases/...`.
- **From B:** take the frozen file list and labels. Upload one staged image from that list for the Friday checkpoint.

**Done when (the guide's definition of done):** after restarting the local app, the same uploaded case is still visible, with audit entries for creation and upload.

---

## Out of scope for Phase 3 (from the guide)

Don't connect an LLM, build real alerts, tune a detector, deploy to the cloud or add production integrations. Real authentication, privacy redaction and EXIF stripping should be noted as follow-ups, not built now.

## Friday checkpoint demo script

1. `POST /v1/trips` returns `TRIP-20261008-7K3F`.
2. `POST /v1/cases` with that trip returns a `caseId`.
3. `POST /v1/cases/<caseId>/images` with a staged image returns an `imageId`.
4. `GET /v1/cases/<caseId>/timeline` shows `case_created` and then `image_uploaded`.
5. Restart the app and repeat step 4. The result is identical.
