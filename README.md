# egg-price-report

Daily 浠水45斤 egg price update for Farmio HK procurement.
Scrapes jbzyw.com, stores history in local JSON/Markdown files, hands a JSON context to Claude for the analysis, and delivers the report to WhatsApp (Whapi.Cloud) and Slack.

Runs as a Claude Code cloud Routine.
Scraping and delivery are plain scripts; Claude only does the analysis.

## Flow

```
npm run scrape    jbzyw listing -> today's 浠水 table + regional 快报 -> data/*.json (exit 2 if no verified price)
npm run context   last 120 days, monthly structure, weight bands, regional quotes, previous report -> JSON
   (Claude)       /tmp/ctx.json + .claude/skills/egg-update/SKILL.md -> /tmp/report.md
npm run send      report -> WhatsApp group via Whapi + Slack webhook
npm run save      report -> data/reports/YYYY-MM-DD.md, for tomorrow's diff
```

## Setup

1. `cp .env.example .env`, fill it in, then `npm install`.
   Nothing loads `.env` automatically; export it in your shell first: `set -a; . ./.env; set +a`.
2. Load history once and commit it: `npm run backfill -- --from 2026-01-01`
   Roughly 240 days, about 3 minutes with the built-in delay.
   Add `--regional` to also load regional 快报 history (slower, optional).
3. Smoke test without sending: `npm run scrape && npm run context | head -40 && npm run send -- README.md --dry`

## Get the WhatsApp group id

```
curl -s "https://gate.whapi.cloud/groups?count=200" -H "Authorization: Bearer $WHAPI_TOKEN" | jq '.groups[] | {id, name}'
```

Put the `id` (ends in `@g.us`) into `EGG_GROUP_ID`.
Use a test group first.

## Routine config

- Environment: Custom network access with `www.jbzyw.com`, `gate.whapi.cloud`, `hooks.slack.com`, plus the default package-manager list.
- API credentials (not env vars): `WHAPI_TOKEN`, `SLACK_WEBHOOK_URL`.
- Env vars: `EGG_GROUP_ID`, `TZ=Asia/Hong_Kong`.
- Setup script: leave empty. The routine prompt runs `npm ci` itself as step 0.
- Schedule: daily 11:00 HK.
- Repo access: the routine commits `data/` and pushes, so it needs write access to this repo.
- Connectors: none.
- Prompt: see `ROUTINE_PROMPT.md`.

## Exit codes

| script | code | meaning |
| --- | --- | --- |
| scrape | 0 | today's 浠水45斤 recorded |
| scrape | 2 | no verifiable price today; the routine sends a no-data notice and stops |
| send | 3 | at least one channel skipped or failed (still prints which) |

## Data model

State lives in `data/` and is committed by the routine after each run. No database.

- `data/xishui.json`: `{ "YYYY-MM-DD": [{ weight_jin, price, price_prev, source_url }] }`, every band 30-45斤.
- `data/regional.json`: `{ "YYYY-MM-DD": [{ province, city, price, unit, trend, raw, source_url }] }`, one entry per city clause.
- `data/reports/YYYY-MM-DD.md`: the report markdown; support/resistance zones are parsed from it when building the next context.
- `EGG_DATA_DIR` overrides the directory (used by tests).

## Tests

`npm test` runs the parsers against saved fixtures in `test/fixtures/` and the context derivations against a temp data dir.
When jbzyw changes layout, save the new page into fixtures and fix the parser against it.
