# Phase 0 Demo Story

Use synthetic Trip IDs only. The prototype demonstrates language and transitions, not a working recovery service.

## High-confidence path

Open the driver journey for `trip_demo_001`. The driver sees only a placeholder bag category, colour, and seat area, then selects **Secure item**. The case moves from `driver_alerted` to `secured` and a safe audit event appears. In the passenger journey, submit a claim for the same Trip ID. The passenger sees **Under review** with no promise about the outcome. The documented continuation is `claim_submitted` → `matched` → `closed` after the item is secured and the claim is reviewed.

## Clarification path

Submit the passenger journey for `trip_demo_002`. The case displays **More details needed** and asks for an additional safe description. It does not expose detected-item evidence or imply that the item has been found for that passenger.

## Sensitive-item path

Submit the passenger journey for `trip_demo_003`, the synthetic passport example. A sensitive claim never moves directly to `matched`; it displays **Being reviewed by our team**. `trip_demo_004` shows the same neutral review message for a claim that has no detection. Operations handling is deliberately outside the Phase 0 prototype.
