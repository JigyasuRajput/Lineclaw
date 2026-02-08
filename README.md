# LINE Talent Inquiry Assistant MVP

Production-oriented MVP for a single manager handling ~200 talents over LINE.

## What this ships
- `POST /api/line/webhook`: auto-reply to inbound text inquiries with confidence policy.
- `POST /api/manager/draft-sentences`: return 3 candidate outbound LINE sentences.
- `POST /api/admin/profiles/sync`: load profile and opportunity data from CSV or Google Sheet CSV URLs.
- `POST /api/admin/retention-cleanup`: cleanup expired conversation logs and dedupe IDs.
- `POST /api/admin/line/push`: send a manual push message to a specific LINE `userId`.
- Personalization using talent profile fields.
- JP/EN response behavior.
- Escalation queue sink (CSV or webhook) + optional manager LINE push notify.
- Conversation memory uses Vercel KV when `@vercel/kv` is available; otherwise in-memory fallback.
- Local webhook simulation script.

## Policy
- `confidence >= 0.75`: answer directly.
- `0.45 <= confidence < 0.75`: ask one clarifying question (once).
- `confidence < 0.45` or sensitive inquiry: escalate.

## Project layout
- `/api` serverless endpoints (Vercel-compatible).
- `/lib` core services and integrations.
- `/data` CSV seed data.
- `/scripts` simulator + retention cleanup script.
- `/tests` automated tests.

## Local setup
1. Copy `.env.example` to `.env` and set values.
2. Ensure Node 18+.
3. Run tests:
   - `npm test`
4. Run a local simulation:
   - `npm run simulate:webhook -- "Any auditions in Tokyo this week?"`

## API examples
### Sync profiles + knowledge
```bash
curl -X POST http://localhost:3000/api/admin/profiles/sync \
  -H 'content-type: application/json' \
  -H 'x-admin-key: YOUR_ADMIN_KEY' \
  -d '{"source":"csv"}'
```

### Draft manager sentences
```bash
curl -X POST http://localhost:3000/api/manager/draft-sentences \
  -H 'content-type: application/json' \
  -H 'x-admin-key: YOUR_ADMIN_KEY' \
  -d '{"audience_tag":"audition","purpose":"Share this week openings","tone":"friendly","language":"ja"}'
```

### Push manual LINE message
```bash
curl -X POST http://localhost:3000/api/admin/line/push \
  -H 'content-type: application/json' \
  -H 'x-admin-key: YOUR_ADMIN_KEY' \
  -d '{"to":"LINE_USER_ID","text":"Hey Jigyasu, as requested, here are current events."}'
```

## Required env vars for real LINE operation
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_MANAGER_USER_ID` (for escalation notify)
- `OPENAI_API_KEY` (optional but recommended)
- `ADMIN_API_KEY`
- Vercel KV environment (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) if you install/use `@vercel/kv`

To discover a LINE user ID quickly, send `whoami` to your bot account from that user. The bot replies with the sender's `userId`.

## Google Sheet mode
Set:
- `SHEETS_PROFILES_CSV_URL`
- `SHEETS_KNOWLEDGE_CSV_URL`

Then call `/api/admin/profiles/sync` with `{ "source": "sheet" }`.

If CSV files are unavailable in serverless runtime, sync falls back to bundled default seed CSV.

## Retention
- Default retention is 30 days (`CONVERSATION_RETENTION_SECONDS=2592000`).
- Use `/api/admin/retention-cleanup` or `npm run retention:cleanup`.

## Notes
- If LINE credentials are not ready, set `ALLOW_UNSIGNED_WEBHOOK=true` for local testing only.
- If OpenAI is disabled or unavailable, deterministic fallback logic is used.
