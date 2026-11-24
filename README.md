# TripTrace AI

TripTrace AI is a privacy-first lost-property recovery prototype for taxi fleets. It includes passenger and driver demo screens, a Node.js API with persistent trip and case records, and a Python privacy service that redacts image uploads before storage.

Use synthetic or consented images during development. The redaction service can miss sensitive content, so inspect every output image during testing.

## Project structure

- `web/` — passenger and driver demo interfaces, mock image assets, and Nginx configuration.
- `api/` — Node.js HTTP API, SQLite repositories, image object storage, mock data, and API verification scripts.
- `privacy-service/` — FastAPI redaction gateway, YuNet face detector, YOLO-World object detector, redaction policy, and Python tests.
- `docs/` — API contract, case schema and state transitions, handoff notes, and demo guidance.
- `data/` — dataset documentation, labels, and development/held-out data directories.
- `triptrace-redaction/INTEGRATION.md` — privacy pipeline integration notes.

## Prerequisites

- Docker Desktop with Docker Compose.
- Internet access for the first privacy image build. The build installs Python/PyTorch dependencies, fetches the YuNet model, and builds YOLO-World weights with TripTrace's vocabulary.
- For local tests outside Docker: Node.js 22 or later and Python 3.12 with the privacy service requirements installed.

The first privacy image build can take several minutes and needs significant disk space for the model dependencies. The running privacy service does not publish a host port; the API reaches it on the Compose network.

## Start the stack

From the repository root:

```sh
docker compose up --build -d
```

Check that the services started and the privacy service became healthy:

```sh
docker compose ps
docker compose logs -f privacy api
```

The log command follows new output. Press **Ctrl+C** to stop following logs without stopping the containers. The API is available at `http://localhost:8000`; the web app is at `http://localhost:8080`.

The privacy service loads its models before reporting healthy. If its model files are missing or fail to load, uploads are blocked. The Compose health check reports this state, and the API waits for the privacy service to become healthy before starting.

To stop the stack while keeping stored API data:

```sh
docker compose down
```

The `api-data` Docker volume stores SQLite data and image objects. Removing the volume deletes that data.

## Demo UI and mock data

- Passenger demo: `http://localhost:8080/passenger/`
- Driver demo: `http://localhost:8080/driver/`

The passenger UI uses scripted mock trips from `api/mock-data/cases.json` (for example, `TRIP-1001` and `TRIP-2003`). Rebuild the API service after editing that file so the updated data is copied into the container:

```sh
docker compose up --build -d api
```

The mock UI submits claims to `/v1/mock/claims`. Its optional image upload is validated in memory and then discarded; **it does not call the privacy redaction pipeline**. Use the persistent API below to test redaction.

## Test image redaction through the persistent API

The upload pipeline is:

1. Create a trip and a case.
2. Send raw JPEG or PNG bytes to the case image endpoint.
3. The API sends the image in memory to the privacy service.
4. Only the returned redacted bytes are stored. The API records the image and redaction audit events after a successful response.
5. Retrieve the stored image through its returned URL.

Create a trip and a detection case from a terminal:

```sh
TRIP_ID=$(curl -sS -X POST http://localhost:8000/v1/trips \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["tripId"])')

curl -sS -X POST http://localhost:8000/v1/cases \
  -H 'Content-Type: application/json' \
  -d "{\"tripId\":\"$TRIP_ID\",\"sourceType\":\"detection\"}"
```

Copy the returned `caseId`, then upload an image. Replace the example case ID and file path; use `image/jpeg` for JPEG files.

```sh
curl -i -X POST \
  http://localhost:8000/v1/cases/CASE_ID/images \
  -H 'Content-Type: image/png' \
  --data-binary @"/path/to/synthetic-image.png"
```

The endpoint expects raw image bytes, not multipart form data. It accepts JPEG and PNG images up to 5 MB. A successful upload returns `201` and a `url`, such as `/v1/images/IMAGE_ID`. Open `http://localhost:8000` plus that path to inspect the stored image. The returned `sizeBytes` and `sha256` describe the redacted image.

Check the case audit timeline for a `redaction_passed` event and detector region counts:

```sh
curl -sS http://localhost:8000/v1/cases/CASE_ID/timeline
```

A successful response means the configured detectors ran and the service applied masks to regions it detected. It does not guarantee that every sensitive object was found. Visually inspect each output, especially documents and phone screens.

Uploads return `422 privacy_check_failed` when redaction refuses an image and `503 privacy_check_failed` when the privacy service is unavailable or returns an invalid response. A failed upload is not stored. A detected case may move to `manual_review` after a redaction failure.

## Redaction behavior and tuning

The privacy service exposes `GET /health` and `POST /v1/redact` on the internal Compose network. The API calls it through `REDACTION_URL=http://privacy:8100`.

- Faces are pixelated with 15% padding. A person detection can provide a head-region fallback when no face is found in that person's head area.
- Documents are covered with a solid mask.
- Phone bodies are retained as item evidence. Screen-on phone screen detections are pixelated only when their boxes substantially overlap a detected phone and are smaller than the phone body; unrelated mirror detections should be ignored.
- The screen-on distinction uses object detector prompts and is not perfect. If the phone body is missed, its screen candidate is not masked.
- The object confidence threshold defaults to `0.35`. Override it for a Compose run by setting `PRIVACY_OBJECT_CONFIDENCE`, for example:

  ```sh
  PRIVACY_OBJECT_CONFIDENCE=0.4 docker compose up --build -d privacy
  ```

  Higher thresholds can reduce false positives but may miss real objects. Evaluate both lit and unlit screens, documents, and faces on synthetic examples before relying on a setting.

Changing redaction code or detector vocabulary requires rebuilding the privacy image. Previously stored images are not reprocessed automatically; upload the original again to get a new redacted image.

### Remaining privacy work

- Publish detected tags, bounding boxes, confidence scores, and redaction status through the API. The current API exposes audit region counts, but does not provide the full detection details to clients.
- Continue fixing and validating phone-screen redaction so it masks only an illuminated display, preserves the phone body, and leaves mirrors and other reflective surfaces untouched.
- Evaluate redaction recall and false positives on more real-world samples, preferably from the LeftIncAr and Cabin datasets, before relying on the current thresholds and prompts.

## Tests and checks

Python redaction and FastAPI tests (install the requirements first):

```sh
cd privacy-service
pip install -r requirements.txt
python -m pytest -q tests
```

Node integration tests use the real Node storage code and a local fake-detector privacy gateway:

```sh
cd api
node --test test/redaction-flow.test.js
```

The mock API verification script is:

```sh
cd api
npm run verify
```

`npm run verify:real` also exists, but review its upload and hash assumptions before using it as a redaction integration check: successful image hashes and sizes now refer to the redacted bytes.

## Project contracts

- [API contract](docs/api-contract.md)
- [Case schema](docs/case-schema.md)
- [Case states and transitions](docs/case-states.md)
- [Team handoff notes](docs/handoff-for-team.md)
- [User journey](docs/user-journey.md)
- [Demo story](docs/demo-story.md)
- [Privacy integration notes](triptrace-redaction/INTEGRATION.md)

## Development data

Keep personal data out of the repository. Use synthetic or consented test images and review generated outputs for missed or overly broad masks. Do not commit real passenger information, real identity documents, or images containing personal data.
