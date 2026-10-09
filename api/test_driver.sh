API=http://localhost:8000; H='Content-Type: application/json'
claim()    { curl -s -X POST $API/v1/mock/claims -H "$H" -d "{\"tripId\":\"$1\",\"description\":\"test\",\"language\":\"en\"}"; echo; }
alert_id() { curl -s $API/v1/mock/driver/alerts | jq -r --arg t "$1" '.alerts[]|select(.tripId==$t)|.alertId'; }
act()      { curl -s -w "  -> HTTP %{http_code}\n" -X POST $API/v1/mock/driver/alerts/$1/actions -H "$H" -d "$2"; }
count()    { curl -s $API/v1/mock/driver/alerts | jq --arg t "$1" '[.alerts[]|select(.tripId==$t)]|length'; }

echo "== 1. No item / privacy failed: expect manual_review, 0 alerts"
claim TRIP-1004; count TRIP-1004
claim TRIP-1005; count TRIP-1005

echo "== 2. Non-detected cases: expect unchanged status, 0 alerts"
claim TRIP-1002; count TRIP-1002
claim TRIP-1003; count TRIP-1003

echo "== 3. Unknown trip: expect 404"
curl -s -w "  -> HTTP %{http_code}\n" -X POST $API/v1/mock/claims -H "$H" -d '{"tripId":"TRIP-9999"}'

echo "== 4. Duplicate claim: expect exactly 1 alert"
claim TRIP-1001; claim TRIP-1001; count TRIP-1001

echo "== 5. Secure, then replay and conflicting action: expect 200, 409, 409"
A=$(alert_id TRIP-1001)
act $A '{"action":"secure"}'
act $A '{"action":"secure"}'
act $A '{"action":"ask_operations"}'
curl -s $API/v1/mock/cases/TRIP-1001; echo

echo "== 6. no_item action: expect manual_review"
claim TRIP-1006; B=$(alert_id TRIP-1006); act $B '{"action":"no_item"}'
curl -s $API/v1/mock/cases/TRIP-1006; echo

echo "== 7. ask_operations action: expect manual_review"
claim TRIP-1007; C=$(alert_id TRIP-1007); act $C '{"action":"ask_operations"}'

echo "== 8. Read twice: readAt must not change, alertStatus in_progress"
claim TRIP-1008; D=$(alert_id TRIP-1008)
curl -s -X POST $API/v1/mock/driver/alerts/$D/read | jq '{alertStatus,readAt}'
sleep 1
curl -s -X POST $API/v1/mock/driver/alerts/$D/read | jq '{alertStatus,readAt}'
act $D '{"action":"secure"}'

echo "== 9. Bad input: expect 400, 400, 404"
act $D '{"action":"return_to_passenger"}'
curl -s -w "  -> HTTP %{http_code}\n" -X POST $API/v1/mock/driver/alerts/$D/actions -H "$H" -d '{bad json'
act ALERT-DOES-NOT-EXIST '{"action":"secure"}'

echo "== 10. Privacy leak check: expect no output"
curl -s $API/v1/mock/driver/alerts | grep -iE "passenger|wording|claim|may have left|tripId.*name" 
curl -s $API/v1/mock/driver/alerts | jq '.alerts[0]|keys'
