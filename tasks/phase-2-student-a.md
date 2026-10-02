# Phase 2: Student A Plan and Decisions

## Confirmed scope

Student A tests the passenger prototype end-to-end, records Phase 2 case-state transitions and escalation requirements for the later operations handoff, and reviews driver wording against passenger messages. Student B owns driver screens and safe mock summaries; Student C owns driver endpoints and the transition service.

The Friday checkpoint is one mock passenger report followed by driver alert review and a secure-item action, with the resulting shared case status verified from the passenger side. No object detection, live notifications, passenger identity disclosure, raw cabin images, or ownership decisions are in scope.

## Verified source baseline

Remote `main` at `ab2f9c8` includes the Phase 2 driver inbox (PR #6). The Student A checkout was fast-forwarded to that revision with local planning files preserved, then branched as `deva/phase-2-student-a`. Runtime results below apply to that application revision with the Student A smoke-check additions.

- `TRIP-1001` begins at `detected`. A mock report records a claim event, changes the case to `driver_alerted`, and creates one driver alert when approved evidence exists.
- Reviewing an unread alert sets the alert to `in_progress`; this is separate from the case status.
- `secure` changes the case to `secured`; `no_item` and `ask_operations` change it to `manual_review` with distinct internal reasons.
- Completing an alert removes its actions. Subsequent actions return `409`; another claim submission does not create another alert once the case has left `detected`.
- Passenger **Refresh status** retrieves the shared case. Both `driver_alerted` and `secured` currently display the same neutral heading and message, although the returned `status` changes.
- State is held in memory and resets on API restart. There is no implemented operations dashboard or operations exit-transition endpoint.
- The driver uses an approved synthetic item crop. This differs from raw cabin imagery and must be checked against the agreed safe-field policy.

Sources: `docs/api-contract.md`, `docs/case-states.md`, `api/src/server.js`, `web/passenger.js`, and `web/driver.js` on the verified remote revision.

## Student A work sequence

1. Agree on passenger-side acceptance evidence and the bounded operations rules below.
2. Test the merged passenger flows and existing Phase 1 outcomes, including Arabic presentation, safe failures, keyboard use, and mobile layout.
3. Run the shared-case happy path, no-item path, help-request path, and duplicate-action/report checks using Student C's service and Student B's UI.
4. Review driver and passenger wording for safe next steps, consistent terminology, and absence of ownership or return promises.
5. Record Phase 2 transitions, actors, audit requirements, and escalation reasons in the existing case-state documentation. Carry unresolved operations questions forward to Phase 7; matching, reopening, and closure rules are not designed or implemented in this phase.
6. Complete the Friday walkthrough and record actual results and any owner-assigned blockers.

## Planning status

All nine interview decisions are resolved. Student A transition documentation, focused smoke checks, and runtime review are implemented. Final integration verification awaits the remaining team implementation. No API, driver UI, dataset, or application behavior was changed by Student A.

## Decisions

The supplied role split and phase exclusions are confirmed requirements. Unanswered interview choices remain pending; recommendations are not accepted decisions.

### Q1 — Visible passenger update after securing

**Accepted: A — distinct safe wording with manual refresh.** After the driver records `secure`, the passenger presses **Refresh status** and sees: “An item has been secured. Your report remains under review.” This communicates physical securing without confirming ownership, a match, or a return.

Student C owns the status-specific API message change. Student A reviews the wording and verifies that the passenger response has `status: secured`, displays the agreed message, and retains the same case reference. Automatic passenger refresh is outside this decision.

Acceptance evidence must show the passenger screen before and after the secure action and the shared case status. Verify this agreed requirement after the remaining Student C changes are integrated.

### Q2 — Driver acknowledgement of an alert

**Accepted: A — reviewing an alert acknowledges it.** Opening **Review alert** records the read acknowledgement and moves a new alert to `in_progress`. The case remains `driver_alerted` until the driver records `secure`, `no_item`, or `ask_operations`. Acknowledgement does not confirm that an item was found or secured, or establish ownership.

Student A verifies the existing B/C workflow: review records `readAt`, the alert becomes `in_progress`, the case remains `driver_alerted`, and reviewing it again does not create a second alert or change the case status. No separate Accept button or case status is required.

### Q3 — Operations handoff scope

**Accepted: A — Phase 2 rules and open questions only.** Student A records the secure-item, no-item, and help-request outcomes, their actors, audit requirements, and escalation reasons. Phase 7 is the destination for this handoff, not work to perform now.

Matching, reopening, and closure decisions remain outside this planning session. Existing broader lifecycle documentation is not evidence that those operations actions are implemented or accepted for Phase 2. Open questions discovered during testing will be recorded without prescribing future behavior.

### Q4 — No-item and help-request outcomes

**Accepted: A — complete the alert and await review.** Both `no_item` and `ask_operations` change the case from `driver_alerted` to `manual_review`, complete the alert, and remove its allowed actions. The driver cannot change the outcome through that completed alert.

Keep the internal reasons distinct: `driver_reported_no_item` and `driver_requested_help`. Each action records a driver-authored `manual_review_requested` audit event with its resulting status and a safe note. The driver sees confirmation of the specific action; the passenger sees neutral review wording after **Refresh status**, without internal reason codes or a claim that the item is definitively absent.

Student A tests each outcome from a fresh demo baseline and checks the shared case reference, resulting status, driver confirmation, and absence of further driver actions. Operations resolution remains an open question for the later handoff.

### Q5 — Duplicate or stale driver actions

**Accepted: A — reject and refresh.** The first successful driver outcome is preserved. A duplicate or conflicting action from a stale tab returns `409`, creates no additional transition or audit event, and triggers retrieval of the current alert so the driver sees the recorded outcome with actions removed.

Student A tests this with two tabs reviewing the same alert: complete it in one tab, then attempt an outcome from the other. Verify the conflict response, unchanged shared case status, completed alert, and refreshed outcome. Student C owns conflict enforcement; Student B owns the driver refresh behavior.

Final verification of the complete reject-and-refresh interaction awaits the remaining team implementation.

### Q6 — Driver-safe synthetic item crop

**Accepted: A — retain the approved synthetic item crop.** The driver may see the item-only crop alongside category, colour, and seat-area hint. Student A checks that the rendered asset reveals no person, identifying text, or raw cabin scene. Passenger identity, passenger claim wording, and ownership decisions remain excluded from the driver view; the passenger view must not expose the image or its URL.

Student B owns the safe summary and asset; Student C owns its API projection and evidence gate. Student A records privacy findings and requests owner fixes rather than creating imagery or detection logic. Approval of this policy does not certify the existing asset: visual and response-field verification are still required.

### Q7 — Reset between mock scenarios

**Accepted: A — restart the mock API.** Save each scenario's evidence before restarting: in-memory cases, alerts, and audit history are reset by the restart. Reload both passenger and driver screens, verify `TRIP-1001` is at `detected`, and verify the driver inbox is empty before starting the next scenario.

Use the existing reset behavior for secure-item, no-item, and help-request tests; do not add reset endpoints, reset controls, persistence, or dedicated outcome fixtures. The stale-tab test runs within one scenario, without a restart between its two competing actions. Record the tested source revision and actual launch/restart command with the test results.

### Q8 — Wording consistency and Arabic regression

**Accepted: A — English consistency plus Arabic regression.** Student A reviews driver instructions and passenger messages together for clear, safe next steps, consistent terminology, and absence of ownership or return promises. Check the distinct secured-item message agreed in Q1 and the action-specific confirmations agreed in Q4.

Recheck the existing Arabic manual-review message and its right-to-left presentation on desktop and mobile. Compare the displayed text and language/direction metadata with the agreed Arabic fixture: rendering English text with Arabic metadata is a regression, even if the text is otherwise safe. Student B reviews any proposed Arabic corrections; Student A records the issue and verifies the agreed correction. No full translation or language-switching system is added.

Review evidence records the case, exact displayed wording, viewport, expected language/direction, and any owner-assigned correction. Baseline observations and integration checks awaiting team implementation are recorded in the matrix below.

### Q9 — Checkpoint evidence and team handoff

**Accepted: A — test matrix, screenshots, and API proof.** Record expected and actual results, the tested source revision, relevant screenshots and API responses, and blockers assigned to B or C. Run the existing checks and browser scenarios. A walkthrough alone does not establish shared state or duplicate-action protection.

Store execution results and evidence links in this plan's matrix; do not mark a row passed until it has been exercised. Keep operational rules in `docs/case-states.md` and terminology in `CONTEXT.md`, linking to them rather than duplicating them. Internal audit history is intentionally absent from passenger and driver responses: obtain C's internal verification evidence for audit-count and reason checks; do not introduce a public audit endpoint.

## Week 3 execution order

1. **Baseline and dependencies:** preserve local work, bring the Student A checkout to the agreed merged team revision, and record its commit. Give B/C the owner items below before testing the agreed behavior.
2. **Passenger regression:** run existing checks, then test the Phase 1 outcomes and safe failure paths on desktop, mobile, and keyboard.
3. **Shared workflow:** execute the secure-item, no-item, help-request, duplicate-report, and stale-tab scenarios. Reset using Q7 and save evidence before every reset.
4. **Rules and wording:** record only Phase 2 transition rules in the existing case-state document; complete the privacy and English/Arabic review. Retest affected scenarios after owner fixes.
5. **Friday checkpoint:** demonstrate `TRIP-1001` report → new alert → review acknowledgement → secure item → passenger manual refresh with the distinct secured message and unchanged case reference. Record results, evidence, and remaining blockers.

## Team integration requirements

| Owner | Required item | Current evidence |
| --- | --- | --- |
| C | Distinct passenger-safe message for `secured`, agreed in Q1 | Verify after C implementation |
| B | Refresh selected alert after a stale-action `409`, agreed in Q5 | Verify after team integration |
| C, with B wording review | Preserve the existing Arabic manual-review message and correct language metadata | Verify after C implementation |
| C | Internal proof of action audit events, distinct escalation reasons, and no extra audit event on rejected actions | Public safe projections omit audit history; existing API verifier does not prove these internal checks |
| A | Run the acceptance matrix, review wording/privacy, and record Phase 2 operations rules | Checks and browser review executed; results below; remaining validation explicitly marked |

These are documented handoff requirements, not messages sent to teammates or completed fixes.

## Acceptance matrix

Results below were recorded on 2026-10-02 against application revision `ab2f9c8`. Evidence is retained in `tasks/evidence/phase-2-student-a/`. Passing helper checks do not establish internal runtime audit counts; those still require C verification.

| Scenario | Expected result | Required evidence | Result |
| --- | --- | --- | --- |
| Fresh baseline | `TRIP-1001` is `detected`; driver inbox is empty | Case GET and inbox GET | Pass — `api-acknowledgement.json` |
| Passenger report | Same case becomes `driver_alerted`; exactly one new alert | Claim response, inbox response, passenger/driver screenshots | Pass — browser flow and `api-acknowledgement.json` |
| Duplicate report | Resubmitting does not create another alert or change the recorded outcome | Repeated POST and inbox count, including after completion | Pass — `api-acknowledgement.json` and `api-secured.json` |
| Review acknowledgement | Alert becomes `in_progress`, has `readAt`; case stays `driver_alerted`; repeated review preserves acknowledgement | Read/detail responses and case GET | Pass — `api-acknowledgement.json` |
| Secure item | Case becomes `secured`; alert completes and offers no actions; passenger refresh shows Q1 message and same reference | Action response, passenger GET, before/after screenshots, C audit proof | Shared state and driver completion verified — `api-secured.json`, `driver-secured.png`; final passenger wording verification awaits C implementation |
| No item found | Case becomes `manual_review`; alert completes; driver sees specific confirmation; passenger sees neutral review message | Action/case responses, screenshots, C proof of `driver_reported_no_item` and audit event | UI/API pass — `api-no-item.json`, `passenger-no-item.png`, `driver-no-item.png`; helper reason/audit checks pass; runtime audit proof pending C |
| Ask operations | Same review state, distinct driver confirmation and internal help reason | Action/case responses, screenshots, C proof of `driver_requested_help` and audit event | UI/API pass — `api-help.json`, `passenger-help.png`, `driver-help.png`; helper reason/audit checks pass; runtime audit proof pending C |
| Stale or duplicate action | First outcome survives; second action returns `409`; stale view retrieves recorded outcome; no extra audit event | Two-tab walkthrough, conflict and refreshed responses, C audit proof | `409` and unchanged outcome verified — `api-secured.json`; final refresh interaction and runtime audit-count proof await team implementation |
| Phase 1 clarification | `TRIP-1002` still shows its agreed clarification | Passenger screenshot and safe response | Pass — `passenger-clarification.png`, `api-secured.json` |
| Arabic manual review | `TRIP-1003` preserves agreed Arabic wording and RTL on the message only | Desktop/mobile screenshots, displayed text and language/direction check | Final Arabic wording and RTL verification awaits C implementation |
| Unknown trip | `TRIP-9999` shows neutral not-found wording without raw API errors | `404` response and passenger screenshot | Pass — `api-secured.json`, `passenger-not-found-mobile.png` |
| Request failure | No false success; clear error; controls allow recovery; no confirmed state is overwritten by an assumed result | Browser walkthrough with failed request and successful retry | Refresh failure/retry pass — `passenger-refresh-failure.png`, `passenger-refresh-recovered.png`; lookup/submission outage paths not separately exercised |
| Safe projections and crop | Driver shows approved item crop and safe hints only; neither screen reveals prohibited fields; passenger receives no image URL | Visual inspection and relevant response bodies | Pass for exercised responses and visual crop inspection — API JSON and driver screenshots |
| Missing/unapproved evidence | Existing evidence gate creates no alert and routes to review | Existing smoke check plus C-owned service verification; no A-owned fixture changes | Helper checks pass for missing, failed, pending and no-item evidence; C-owned service/fixture proof pending |
| Accessibility and mobile | Passenger steps and driver actions remain usable with keyboard and mobile width; outcomes are announced/focused appropriately | Browser notes and screenshots | Partial pass — 390px passenger/driver layouts have no horizontal overflow; keyboard lookup/result focus verified; full keyboard action path and screen-reader announcements remain unverified |

## Existing verification and demo commands

Run from the repository root after the checkout contains the agreed Phase 2 code. The automated checks and Compose launch were executed successfully during Student A review. Start Docker Desktop first and ensure API is running before starting the web container.

```sh
npm --prefix api run verify
node web/smoke-test.js
git diff --check
docker compose up -d --build
docker compose ps
```

Open `http://localhost:8080/passenger.html` and `http://localhost:8080/driver.html`. Between independent scenarios, save evidence and run:

```sh
docker compose restart api
```

Reload both screens and verify the baseline. Existing automated checks cover several service transitions and safe projections; they do not replace browser testing, Arabic regression, Q1 wording, Q5 conflict refresh, or C's internal audit proof. Extend existing checks only where necessary; do not create a new testing framework.

## Completion criteria

- The Friday shared-case walkthrough passes, including the distinct visible passenger update.
- Every acceptance row has actual results and evidence; acceptance-critical failures are resolved and retested.
- Phase 2 transition rules record actors, outcomes, audit requirements, and distinct escalation reasons in the existing case-state document.
- Wording and privacy reviews are complete, including existing Arabic presentation and synthetic crop verification.
- B/C handoffs identify agreed requirements and evidence needed; unresolved future operations questions are listed without designing Phase 7.

## Verification summary and handoff

Student A ran the existing real-HTTP API verifier and extended the web smoke check for escalation reasons, audit fields, invalid post-completion transitions, input immutability, and unsafe/missing evidence. Both pass. `node --check web/smoke-test.js` and `git diff --check` pass. No dependencies or new test framework were added.

Baseline browser checks cover passenger reporting, driver acknowledgement, shared case status, no-item/help outcomes, duplicate reports/actions, safe not-found, refresh failure/retry, and 390px layouts. Screenshots and JSON proof are retained in [the evidence folder](evidence/phase-2-student-a/). This is baseline evidence, not final sign-off on the remaining team implementation.

Final passenger wording, Arabic presentation, conflict refresh, internal runtime audit counts, and service-level missing-evidence checks will be verified after the remaining team changes are integrated. Full screen-reader and keyboard action validation and the final Friday walkthrough remain pending. No defects are logged against unfinished Student C work.

Student A's operations handoff is the Phase 2 section of [case-states.md](../docs/case-states.md); matching, reopening, and closure decisions remain deferred.
