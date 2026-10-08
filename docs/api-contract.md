# API Contract

The API has two parts:

- **Phase 3 persistent API (`/v1/trips`, `/v1/cases`, `/v1/images`)**: real local storage. Trips, cases, images and audit events are kept in SQLite and on disk, so they survive restarts.
- **Phase 2 mock API (`/v1/mock/...`)**: unchanged. It holds synthetic cases and driver alerts in memory, and restarting resets it.

## Phase 3 persistent API

Data lives in `DATA_DIR`, which defaults to `api/storage/`. It is gitignored and lives in the `api-data` volume under Docker Compose. It contains `triptrace.sqlite` and an `objects/` folder of uploaded images. Use staged or synthetic images only.

Every error returns JSON with `error` (a stable code) and `message` (safe to show to users).

### `POST /v1/trips`

Creates a synthetic trip. There is no request body.

`201` → `{ "tripId": "TRIP-20261008-7K3F", "createdAt": "2026-10-08T15:21:25.439Z" }`

Trip IDs use the UTC date and 4 characters that exclude the lookalikes `0 O 1 I L`. They are unique: a taken ID is regenerated.

### `GET /v1/trips/{tripId}`

`200` → the trip, or `404 trip_not_found`.

### `POST /v1/cases`

```json
{ "tripId": "TRIP-20261008-7K3F", "sourceType": "detection" }
```

| `sourceType` | Starting `status` | First audit event | Actor |
| --- | --- | --- | --- |
| `detection` | `detected` | `case_created` | system |
| `passenger_claim` | `claim_submitted` | `claim_submitted` | passenger |

`201` → the case: `caseId`, `tripId`, `status`, `sourceType`, `privacy`, `createdAt` and `updatedAt`. The case and its first audit event are saved together, or not at all.

Errors: `400 invalid_json`, `400 invalid_case` (missing `tripId` or an unsupported `sourceType`, including `manual_entry`, which has no agreed starting state), and `404 trip_not_found`.

### `GET /v1/cases/{caseId}`

`200` → the case, plus `images`: `[{ imageId, caseId, contentType, sizeBytes, sha256, uploadedAt, url }]`, oldest first. Returns `404 case_not_found` for an unknown case.

### `POST /v1/cases/{caseId}/images`

Send the **raw image bytes** as the body (not multipart form data), with `Content-Type: image/jpeg` or `image/png`. Browser example:

```js
await fetch(`/v1/cases/${caseId}/images`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
```

`201` → `{ imageId, caseId, contentType, sizeBytes, sha256, uploadedAt, url }`. This also appends an `image_uploaded` audit event whose `details` are `imageId`, `contentType`, `sizeBytes` and `sha256`. The original file name is never stored.

| Status | `error` | When |
| --- | --- | --- |
| `400` | `empty_image` | The body is empty |
| `404` | `case_not_found` | The case does not exist |
| `413` | `image_too_large` | Larger than 5 MB |
| `415` | `unsupported_image_type` | Not JPEG/PNG, or the bytes do not match the declared type |

The `413` and `415` responses share one message: "Only JPEG or PNG images up to 5 MB are accepted."

### `GET /v1/images/{imageId}`

`200` → the image bytes with their content type, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`. Use the `url` from the upload response directly as an `<img src>`. Returns `404 image_not_found` for an unknown image.

### `GET /v1/cases/{caseId}/timeline`

`200` → `{ caseId, tripId, status, auditTimeline: [...] }`. Events are oldest first, and events from the same millisecond keep the order they were saved in. Each event has `eventId`, `eventType`, `occurredAt` and `actorType`, plus `status`, `note` and `details` only when present, which is the same shape as the mock `auditTimeline` and [example-case.json](example-case.json). Returns `404 case_not_found` for an unknown case.

The audit timeline is append-only and is an **operations and case-history view**. Do not show it on passenger screens.

### Verifying

```sh
cd api && npm run verify:real
```

This uses a temporary `DATA_DIR`. It creates a trip, a case and an upload, checks the timeline, restarts the server and checks everything again.

## Phase 2 mock API

The mock API holds synthetic cases and driver alerts in memory. Restarting the API resets the demo. It has one fixed session: `DRIVER-MOCK-001` in `VEHICLE-MOCK-204`.

### Passenger endpoints

#### `GET /v1/mock/cases/{tripId}`

Returns the passenger-safe case projection: `tripId`, `caseId`, `status`, `language`, `responseType`, `safePassengerMessage`, and `clarificationQuestion`.

It never returns a driver alert, assignment, item image, image URL, detector result, confidence, bounding box, audit history, internal review reason, or passenger claim content.

#### `POST /v1/mock/claims`

Accepts `{ "tripId": "TRIP-1001" }`. The scripted `TRIP-1001` report records `claim_submitted`, moves the case to `driver_alerted`, and creates one alert when safe evidence is available. Its passenger response remains neutral.

If no privacy-approved safe crop is available, the case moves to `manual_review` with internal reason `driver_alert_evidence_unavailable`; no driver alert is created.

### Driver endpoints

#### `GET /v1/mock/driver/session`

Returns the fixed demo driver and vehicle summary.

#### `GET /v1/mock/driver/alerts`

Returns alerts assigned to the fixed session, newest first. Each alert contains:

- `alertId`, `caseId`, `tripId`, timestamps, `readAt`, `alertStatus`, and `caseStatus`
- one approved `detectedItem`: `category`, `colour`, `seatAreaHint`, `imageUrl`, and `imageAlt`
- `allowedActions` and an action `outcomeMessage` after completion

The response excludes passenger claim wording and identity, detector confidence, bounding boxes, model data, raw imagery, alternative items, and assignment identifiers.

#### `GET /v1/mock/driver/alerts/{alertId}`

Returns one assigned driver-safe alert. Reading this endpoint does not change its read state.

#### `POST /v1/mock/driver/alerts/{alertId}/read`

Records `readAt` and moves a new alert to `in_progress`.

#### `POST /v1/mock/driver/alerts/{alertId}/actions`

Accepts one of:

```json
{ "action": "secure" }
```

| Action | Case result | Audit event | Driver confirmation |
| --- | --- | --- | --- |
| `secure` | `secured` | `item_secured` | Item secured; operations provides next steps. |
| `no_item` | `manual_review` | `manual_review_requested` with `driver_reported_no_item` | Operations has been asked to review. |
| `ask_operations` | `manual_review` | `manual_review_requested` with `driver_requested_help` | Help request recorded. |

The first action completes the alert and removes all allowed actions. Repeated actions return `409`. The API also rejects alerts outside `driver_alerted` or missing privacy-approved evidence.

## Safety and scope

The crop at `/assets/mock/black-bag-safe-crop.png` is a committed synthetic retrieval asset. The fixture never contains raw cabin imagery. A possible-item association is a demo trigger; it does not determine ownership or authorize a passenger handover.

The mock endpoints have no persistence. Neither part has real authentication, WebSockets, device push notifications, an operations dashboard, live object detection, privacy redaction, or EXIF stripping. Uploaded images are stored exactly as sent.
