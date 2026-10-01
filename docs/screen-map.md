# Phase 2 Screen Map

```mermaid
flowchart LR
    Root[/] --> Passenger[/passenger/]
    Passenger --> P1[Trip lookup]
    P1 --> P2[Passenger report]
    P2 --> P3[Neutral status]
    P2 -->|TRIP-1001 with safe crop| A[Create assigned alert]
    Driver[/driver/] --> D1[Assigned alert inbox]
    A --> D1
    D1 --> D2[Alert detail]
    D2 --> D3[Secure item]
    D2 --> D4[No item found]
    D2 --> D5[Ask operations]
    D3 --> P3
    D4 --> P3
    D5 --> P3
```

## Data boundaries

| Screen | Safe display | Excluded data |
| --- | --- | --- |
| `/passenger/` | Synthetic trip ID, neutral status, clarification question | Driver route, driver identity, alert, safe crop, item evidence, audit records, review reason |
| `/driver/` inbox | Mock driver and vehicle, unread count, Trip ID, case reference, safe crop, item category, colour, seat hint | Passenger identity, claim wording, raw cabin image, confidence, bounding box, model data, alternative items |
| Driver detail | Larger approved crop, retrieval guidance, allowed actions, neutral completion result | Handover authorization and ownership decision |

`TRIP-1001` creates one alert only when its assigned driver, detected item, `noItem: false`, privacy-approved crop, and safe image metadata are present. Otherwise the case is routed to operations review without an incomplete driver alert. The driver inbox refreshes every 15 seconds while open; it has no device push capability. API state resets when the service restarts.
