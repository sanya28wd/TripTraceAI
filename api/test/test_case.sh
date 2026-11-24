#!/usr/bin/env bash
# TripTrace mock API: run the passenger -> driver flow for one Trip ID.
#
# Usage:    ./test_case.sh TRIP-1001
#           ./test_case.sh TRIP-1006 no_item        (secure | no_item | ask_operations)
# Verbose:  VERBOSE=1 ./test_case.sh TRIP-1001      (also prints full JSON per step)
# Other port: API=http://localhost:9000 ./test_case.sh TRIP-1001
#
# Needs: curl, python3

# Run using: ./test_case.sh TRIP-1001

set -u

TRIP_ID="${1:-}"
ACTION="${2:-secure}"
API="${API:-http://localhost:8000}"
VERBOSE="${VERBOSE:-0}"

if [ -z "$TRIP_ID" ]; then
  echo "Usage: $0 <TRIP_ID> [secure|no_item|ask_operations]"
  exit 1
fi

TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
CODE=""; BODY=""
CHECKS=(); FAILS=0

if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; B=$'\033[1m'; D=$'\033[2m'; N=$'\033[0m'; else G=""; R=""; B=""; D=""; N=""; fi

# ---------- helpers ----------
call() { # METHOD PATH [JSON]
  if [ -n "${3:-}" ]; then
    CODE=$(curl -s -o "$TMP" -w '%{http_code}' -X "$1" "$API$2" -H 'Content-Type: application/json' -d "$3")
  else
    CODE=$(curl -s -o "$TMP" -w '%{http_code}' -X "$1" "$API$2")
  fi
  BODY="$(cat "$TMP")"
}

pretty() {
  printf '%s' "$1" | python3 -c '
import sys, json
raw = sys.stdin.read()
try: print(json.dumps(json.loads(raw), indent=2, ensure_ascii=False))
except Exception: print(raw or "(empty)")'
}

jget() { # JSON KEY
  printf '%s' "$1" | python3 -c '
import sys, json
try:
    v = json.load(sys.stdin).get(sys.argv[1]); print("" if v is None else v)
except Exception: print("")' "$2"
}

alert_info() { # ALERTS_JSON TRIP -> "<count> <alertId>"
  printf '%s' "$1" | python3 -c '
import sys, json
try:
    m = [a for a in json.load(sys.stdin).get("alerts", []) if a.get("tripId") == sys.argv[1]]
    print(len(m), m[0]["alertId"] if m else "")
except Exception: print(0, "")' "$2"
}

step() { # LABEL DETAIL
  printf '  %-24s %-5s %s\n' "$1" "$CODE" "$2"
  if [ "$VERBOSE" = 1 ]; then pretty "$BODY" | sed "s/^/      ${D}/;s/\$/${N}/"; fi
}

check() { # LABEL OK(1/0)
  if [ "$2" = 1 ]; then CHECKS+=("${G}PASS${N}  $1"); else CHECKS+=("${R}FAIL${N}  $1"); FAILS=$((FAILS+1)); fi
}

# ---------- run ----------
echo
echo "${B}TripTrace test${N}  trip=$TRIP_ID  action=$ACTION"
echo "  STEP                     HTTP  RESULT"
echo "  -----------------------  ----  ------------------------------"

call GET /health
step "Server health" "$(jget "$BODY" status)"
if [ "$CODE" != "200" ]; then echo; echo "${R}Server not reachable at $API${N}"; exit 1; fi

call GET "/v1/mock/cases/$TRIP_ID"
STATUS_BEFORE="$(jget "$BODY" status)"
CASE_CODE="$CODE"
step "Case before claim" "${STATUS_BEFORE:-$(jget "$BODY" error)}"

if [ "$CASE_CODE" = "404" ]; then
  echo
  echo "${B}SUMMARY${N}"
  echo "  Case type   UNKNOWN TRIP (404)"
  exit 0
fi

CLAIM="{\"tripId\":\"$TRIP_ID\",\"description\":\"I may have left a black bag in the back seat.\",\"language\":\"en\"}"
call POST /v1/mock/claims "$CLAIM"
STATUS_CLAIM="$(jget "$BODY" status)"
step "Submit claim" "$STATUS_CLAIM"

call POST /v1/mock/claims "$CLAIM"
STATUS_DUP="$(jget "$BODY" status)"
step "Duplicate claim" "$STATUS_DUP"

call GET /v1/mock/driver/alerts
ALERTS_JSON="$BODY"
read -r ALERT_COUNT ALERT_ID <<< "$(alert_info "$ALERTS_JSON" "$TRIP_ID")"
step "Driver alerts for trip" "$ALERT_COUNT alert(s)"

# privacy: driver payload must not carry passenger wording
if printf '%s' "$ALERTS_JSON" | grep -qiE 'passengerWording|may have left|"claim"'; then check "Driver payload has no passenger wording" 0; else check "Driver payload has no passenger wording" 1; fi
# duplicate claim must not change status or add alerts
if [ "$STATUS_DUP" = "$STATUS_CLAIM" ] && [ "$ALERT_COUNT" -le 1 ]; then check "Duplicate claim creates no extra alert" 1; else check "Duplicate claim creates no extra alert" 0; fi

ACTION_CODE="n/a"
if [ -z "$ALERT_ID" ]; then
  printf '  %-24s %-5s %s\n' "Driver steps" "-" "skipped (no alert)"
else
  call POST "/v1/mock/driver/alerts/$ALERT_ID/read"
  READ1="$(jget "$BODY" readAt)"; step "Mark read (1st)" "alertStatus=$(jget "$BODY" alertStatus)"
  sleep 1
  call POST "/v1/mock/driver/alerts/$ALERT_ID/read"
  READ2="$(jget "$BODY" readAt)"; step "Mark read (2nd)" "readAt unchanged: $([ "$READ1" = "$READ2" ] && echo yes || echo NO)"
  if [ -n "$READ1" ] && [ "$READ1" = "$READ2" ]; then check "Reading twice keeps readAt" 1; else check "Reading twice keeps readAt" 0; fi

  call POST "/v1/mock/driver/alerts/$ALERT_ID/actions" "{\"action\":\"$ACTION\"}"
  ACTION_CODE="$CODE"; step "Driver action: $ACTION" "caseStatus=$(jget "$BODY" caseStatus)"

  call POST "/v1/mock/driver/alerts/$ALERT_ID/actions" "{\"action\":\"$ACTION\"}"
  step "Replay same action" "$(jget "$BODY" error)"
  if [ "$CODE" = "409" ]; then check "Replayed action rejected (409)" 1; else check "Replayed action rejected (409)" 0; fi

  call POST "/v1/mock/driver/alerts/$ALERT_ID/actions" '{"action":"return_to_passenger"}'
  step "Invalid action" "$(jget "$BODY" error)"
  if [ "$CODE" = "400" ] || [ "$CODE" = "409" ]; then check "Invalid action rejected" 1; else check "Invalid action rejected" 0; fi
fi

call GET "/v1/mock/cases/$TRIP_ID"
STATUS_FINAL="$(jget "$BODY" status)"
step "Case after flow" "$STATUS_FINAL"

# ---------- classify the case ----------
if [ "$ALERT_COUNT" -gt 1 ]; then
  CASE_TYPE="DUPLICATE ALERT BUG ($ALERT_COUNT alerts)"
elif [ "$STATUS_BEFORE" != "detected" ]; then
  case "$STATUS_BEFORE" in
    clarification_needed) CASE_TYPE="CLARIFICATION: claim ignored, question stays" ;;
    manual_review)        CASE_TYPE="MANUAL REVIEW (e.g. sensitive): claim ignored" ;;
    claim_submitted)      CASE_TYPE="ALREADY CLAIMED: claim ignored" ;;
    *)                    CASE_TYPE="NOT DETECTED ($STATUS_BEFORE): claim ignored" ;;
  esac
elif [ "$ALERT_COUNT" = "0" ]; then
  CASE_TYPE="NO SAFE EVIDENCE: no item or privacy failed -> manual_review"
else
  case "$ACTION" in
    secure)         CASE_TYPE="NORMAL: alert -> driver secured item" ;;
    no_item)        CASE_TYPE="DRIVER: no item found -> manual_review" ;;
    ask_operations) CASE_TYPE="DRIVER: asked operations -> manual_review" ;;
    *)              CASE_TYPE="ALERT with action $ACTION" ;;
  esac
fi

# ---------- summary ----------
echo
echo "${B}SUMMARY${N}"
echo "  +--------------+--------------------------------------------------------+"
printf '  | %-12s | %-54s |\n' "Trip ID"   "$TRIP_ID"
printf '  | %-12s | %-54s |\n' "Case type" "$CASE_TYPE"
printf '  | %-12s | %-54s |\n' "Status"    "$STATUS_BEFORE -> $STATUS_FINAL"
printf '  | %-12s | %-54s |\n' "Alerts"    "$ALERT_COUNT"
printf '  | %-12s | %-54s |\n' "Driver act" "$([ -n "$ALERT_ID" ] && echo "$ACTION (HTTP $ACTION_CODE)" || echo "none")"
printf '  | %-12s | %-54s |\n' "Checks"    "$(( ${#CHECKS[@]} - FAILS ))/${#CHECKS[@]} passed"
echo "  +--------------+--------------------------------------------------------+"
for c in "${CHECKS[@]}"; do echo "  $c"; done
echo
echo "${D}State is in memory: restart the server to reset this Trip ID.${N}"
[ "$FAILS" -eq 0 ]
