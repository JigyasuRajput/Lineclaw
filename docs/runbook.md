# Pilot Runbook (Week 1)

## Pre-flight
- Set environment values from `.env.example`.
- Confirm `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` are populated.
- Run `POST /api/admin/profiles/sync` with `{ "source": "csv" }` or `{ "source": "sheet" }`.
- Validate manager authorization using `x-admin-key`.

## Soft launch (20 talents)
- Start with selected user IDs only (LINE side targeting).
- Track escalation volume and false negatives daily.
- Tune confidence thresholds once per day only.

## Daily checks
- Escalation queue freshness (new rows in queue CSV/sheet).
- Top unanswered intents from conversation logs.
- Manager handling time (target: 30-60 min/day).

## Incident handling
- If hallucination risk is detected, temporarily raise answer threshold (e.g., 0.8).
- If API timeout spikes occur, force escalate path by setting `DISABLE_EXTERNAL_AI=true`.
- If sheet sync fails, keep last loaded memory state and notify manager manually.
