# MVP Remaining TODO

## Critical setup (must do before live traffic)
- [ ] Create `/Users/cestercian/Documents/New project/.env` from `.env.example`.
- [ ] Set real LINE credentials in `.env`:
  - [ ] `LINE_CHANNEL_SECRET`
  - [ ] `LINE_CHANNEL_ACCESS_TOKEN`
  - [ ] `LINE_MANAGER_USER_ID`
- [ ] Set admin security key:
  - [ ] `ADMIN_API_KEY`
- [ ] Decide AI mode:
  - [ ] Set `OPENAI_API_KEY` and keep `DISABLE_EXTERNAL_AI=false` for LLM responses, or
  - [ ] Keep fallback-only mode with `DISABLE_EXTERNAL_AI=true`.
- [ ] Decide data sync mode:
  - [ ] CSV mode: verify `PROFILES_CSV_PATH` + `KNOWLEDGE_CSV_PATH`, or
  - [ ] Sheet mode: set `SHEETS_PROFILES_CSV_URL` + `SHEETS_KNOWLEDGE_CSV_URL`.
- [ ] (Optional) Enable Vercel KV conversation memory:
  - [ ] Add `@vercel/kv` package
  - [ ] Set `KV_REST_API_URL` + `KV_REST_API_TOKEN`.

## Deploy and connect LINE
- [ ] Deploy to Vercel.
- [ ] Set all required environment variables in Vercel project settings.
- [ ] Set LINE webhook URL to:
  - [ ] `https://<your-vercel-domain>/api/line/webhook`
- [ ] Enable webhook in LINE Official Account Manager.
- [ ] Verify signature validation succeeds with real LINE callbacks.

## Data and workflow readiness
- [ ] Run initial profile/knowledge sync:
  - [ ] `POST /api/admin/profiles/sync` with `{ "source": "csv" }` or `{ "source": "sheet" }`.
- [ ] Confirm escalation sink destination:
  - [ ] CSV queue (`ESCALATION_QUEUE_CSV_PATH`) or
  - [ ] webhook (`ESCALATION_SHEET_WEBHOOK_URL`).
- [ ] Confirm manager notification path works (`LINE_MANAGER_USER_ID` push).
- [ ] Confirm manager draft endpoint works with admin key:
  - [ ] `POST /api/manager/draft-sentences`.

## Pilot launch (requested)
- [ ] Start pilot with 20 talents.
- [ ] Monitor escalation volume daily.
- [ ] Monitor false negatives daily (cases that should have escalated but did not).
- [ ] Track first response time, auto-resolution rate, and manager override frequency.
- [ ] Tune confidence thresholds once per day only (controlled changes).

## Safety and acceptance checks
- [ ] Run sensitive-topic test cases in production-like environment (legal/payment/harassment wording).
- [ ] Validate idempotency with repeated webhook delivery.
- [ ] Validate JP and EN behavior on real user messages.
- [ ] Run retention cleanup job (`/api/admin/retention-cleanup` or `npm run retention:cleanup`).
- [ ] Complete pilot checklist in `/Users/cestercian/Documents/New project/docs/pilot-checklist.md`.

## After stable 48h pilot
- [ ] Expand from 20 talents to full ~200 talents.
- [ ] Create weekly review routine for top unanswered intents.
- [ ] Maintain/update knowledge sheet to reduce escalation load.
