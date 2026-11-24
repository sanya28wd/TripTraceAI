# Redaction pipeline: integration notes

Flow after this change: **upload → privacy gateway (redact in memory) → only the redacted bytes are written → image row + audit → only then can the frontend fetch it.** The original bytes are never written to disk, logged, or returned.

## What is in this folder

| Path | What it is |
| --- | --- |
| `privacy-service/redaction.py` | Core: decode, orient, run detectors, mask, verify masks, re-encode (drops EXIF/GPS). Fails closed. |
| `privacy-service/detectors.py` | YuNet face detector and a YOLO-World detector (phones, screens, laptops, passports, ID cards, paper, books, people). |
| `privacy-service/app.py` | FastAPI wrapper: `POST /v1/redact`, `GET /health`. 503 until both models load. |
| `privacy-service/build_vocab.py`, `Dockerfile`, `requirements.txt` | Build the container; bakes the vocabulary into the weights so runtime needs no internet. |
| `privacy-service/tests/` | 20 pytest tests plus `fake_server.py` used by the Node tests. |
| `api/src/redaction-client.js` | New. Calls the gateway; any outage or odd reply is a "failed" outcome. |
| `api/src/images-repo.js` | **Replaces** yours. `saveCaseImage` redacts first; adds `getServableImage`, `PrivacyBlockedError`; `listCaseImages` lists redacted images only. `getImage` is removed on purpose. |
| `api/src/db.js` | **Replaces** yours. Adds `redaction_status` and `redaction_report_json` to `images`, with a migration for existing databases. |
| `api/test/redaction-flow.test.js` | 8 tests: real Node storage code against the real gateway with fake detectors. |
| `docker-compose.privacy.yml` | Snippet to merge into your compose file. |

## Edits to `server.js` (4 spots)

**1. Import line.** Replace `getImage` with `getServableImage` and add `PrivacyBlockedError`:

```js
const { bytesMatchContentType, CaseNotFoundError, getServableImage, isImageContentType, listCaseImages, maxImageBytes, PrivacyBlockedError, saveCaseImage } = require("./images-repo");
```

**2. Missing helpers.** The `server.js` in the project uses `imageRejectedMessage`, `readBinaryBody` and `PayloadTooLargeError` in the image-upload branch but never defines or imports them, so that branch throws a ReferenceError. If your local copy already has them, skip this. Otherwise add near the top, below `driverActions`:

```js
const imageRejectedMessage = "Only JPEG or PNG images up to 5 MB are accepted.";
const privacyBlockedMessage = "This image could not be safely processed, so it was not saved. Operations has been notified.";

class PayloadTooLargeError extends Error {
  constructor() { super("Request body is too large."); this.name = "PayloadTooLargeError"; }
}

/** Reads a raw request body and rejects as soon as it passes limitBytes. */
const readBinaryBody = (request, limitBytes) => new Promise((resolve, reject) => {
  const chunks = [];
  let total = 0;
  let tooLarge = false;
  request.on("data", (chunk) => {
    if (tooLarge) return;
    total += chunk.length;
    if (total > limitBytes) { tooLarge = true; chunks.length = 0; reject(new PayloadTooLargeError()); return; }
    chunks.push(chunk);
  });
  request.on("end", () => { if (!tooLarge) resolve(Buffer.concat(chunks)); });
  request.on("error", reject);
});
```

**3. Upload branch.** In `POST /v1/cases/{caseId}/images`, extend the `catch` after `saveCaseImage`:

```js
      } catch (error) {
        if (error instanceof CaseNotFoundError) return sendJson(response, 404, { error: "case_not_found", message: "No case exists for this ID." });
        if (error instanceof PrivacyBlockedError) {
          return sendJson(response, error.unavailable ? 503 : 422, { error: "privacy_check_failed", message: privacyBlockedMessage });
        }
        throw error;
      }
```

**4. Serving branch.** In `GET /v1/images/{imageId}`, use the gated lookup:

```js
      const image = getServableImage(db, decodeURIComponent(imageMatch[1]));
```

I could not run these four edits against your real `server.js` (I only have the text). The helper block in step 2 was tested on its own; the rest is a few lines, so run `node --check src/server.js` and one upload after applying.

## Doc updates for the team

**`case-states.md`**: add this transition row (it is not in the table today, so Student C and the team need to agree it):

| From | To | Trigger | Actor | Required audit event | Manual-review reason |
| --- | --- | --- | --- | --- | --- |
| `detected` | `manual_review` | Privacy redaction failed or was unavailable | system | `manual_review_requested` with note | `privacy_blocked` |

New audit event types: `privacy_check_failed` (details: `reason`), `redaction_passed` (details: policy version, detector versions, region counts). Only a `detected` case is moved; a case already further along keeps its status and just gets the `privacy_check_failed` event.

**`api-contract.md`**:
- `POST /v1/cases/{caseId}/images` gains `422 privacy_check_failed` (gateway refused the image) and `503 privacy_check_failed` (gateway unavailable; retryable). Nothing is stored in either case.
- The response `sha256` and `sizeBytes` now describe the **redacted** file, so they differ from the uploaded one.
- `GET /v1/cases/{caseId}` lists, and `GET /v1/images/{id}` serves, only images whose redaction passed.
- Update "Safety and scope": redaction and EXIF stripping now exist for this endpoint (re-encoding drops all metadata). `/v1/mock/claims` still reads its optional image into memory and discards it.
- `handoff-for-team.md` tells Student B the API does not strip EXIF; that is no longer true.

## Run it

```sh
# gateway tests (no models needed)
cd privacy-service && pip install -r requirements.txt && python -m pytest -q tests

# Node tests (spawns the gateway with fake detectors)
cd api && node --test test/redaction-flow.test.js

# real stack
docker compose up --build        # after merging docker-compose.privacy.yml
```

Existing `api/storage/` data: Phase 3 uploads on disk are unredacted. The migration marks them `not_started`, so the API never lists or serves them, but the files are still in `objects/`. Delete the storage volume (or those files) before the demo.

`npm run verify:real` (not in the project) uploads images and will now need the gateway running, and any check that compares the stored hash with the uploaded file will fail by design.

## What is and is not verified

| Verified here | Not verified here |
| --- | --- |
| Masking geometry, padding, clamping, mosaic vs solid fill, overlap handling, EXIF stripping and orientation, oversize and corrupt input, detector crash, missing detector, NaN boxes (20 pytest tests) | Real YuNet and YOLO-World detection (model downloads from GitHub were blocked in the sandbox) |
| Node storage path end to end: redacted file only on disk, nothing on disk after any failure, audit events, case state, serving gate, Phase 3 database migration (8 tests) | The Dockerfile build, including the CLIP install and `build_vocab.py` |
| FastAPI contract incl. 503 when not ready | The `server.js` edits against your real file |

## Decisions you need to make

1. **Phones are pixelated, not blacked out.** Blacking out a phone destroys the item evidence the detector needs next, but a mosaic may also stop YOLO from recognising it. Measure item-detection recall on *redacted* phone images in Phase 4; if it is poor, run item detection inside the gateway on the original and return only boxes and tags.
2. **Recall is the real risk.** "passed" means the detectors ran, not that nothing sensitive is left. Build the redaction-recall check on the privacy test set (faces, passports, ID cards, paper in hand, lit phone screens) before trusting thresholds. Thresholds are deliberately low (0.5 face, 0.15 objects) so false masks are preferred to misses.
3. **Every redaction failure moves a `detected` case to manual review**, including a gateway outage. That is strict by design ("privacy failures block the case"); if outages during the demo worry you, treat `redaction_unavailable` as retry-only and leave the status alone.
