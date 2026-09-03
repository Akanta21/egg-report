# egg-price-report

Daily 浠水45斤 egg price update for Farmio HK procurement.
Scrapes jbzyw.com, stores history in Postgres, hands a JSON context to Claude for the analysis, and delivers the report to WhatsApp (Whapi.Cloud) and Slack.

Runs as a Claude Code cloud Routine.
Scraping and delivery are plain scripts; Claude only does the analysis.

## Flow

```
npm run scrape    jbzyw listing -> today's 浠水 table + regional 快报 -> Postgres (exit 2 if no verified price)
npm run context   last 120 days, monthly structure, weight bands, regional quotes, previous report -> JSON
   (Claude)       /tmp/ctx.json + .claude/skills/egg-update/SKILL.md -> /tmp/report.md
npm run send      report -> WhatsApp group via Whapi + Slack webhook
npm run save      report + support/resistance zones -> Postgres, for tomorrow's diff
```

## Setup

1. Create a Postgres DB (Neon or Supabase).
2. `cp .env.example .env`, fill it in.
3. `npm install && npm run migrate`
4. Load history: `npm run backfill -- --from 2026-01-01`
   Roughly 240 days, about 3 minutes with the built-in delay.
   Add `--regional` to also load regional 快报 history (slower, optional).
5. Smoke test without sending: `npm run scrape && npm run context | head -40 && npm run send -- README.md --dry`

## Get the WhatsApp group id

```
curl -s "https://gate.whapi.cloud/groups?count=200" -H "Authorization: Bearer $WHAPI_TOKEN" | jq '.groups[] | {id, name}'
```

Put the `id` (ends in `@g.us`) into `EGG_GROUP_ID`.
Use a test group first.

## Routine config

- Environment: Custom network access with `www.jbzyw.com`, `gate.whapi.cloud`, `hooks.slack.com`, your DB host, plus the default package-manager list.
- API credentials (not env vars): `DATABASE_URL`, `WHAPI_TOKEN`, `SLACK_WEBHOOK_URL`.
- Env vars: `EGG_GROUP_ID`, `TZ=Asia/Hong_Kong`.
- Setup script: `npm ci`
- Schedule: daily 11:00 HK.
- Connectors: none.
- Prompt: see `ROUTINE_PROMPT.md`.

## Exit codes

| script | code | meaning |
| --- | --- | --- |
| scrape | 0 | today's 浠水45斤 recorded |
| scrape | 2 | no verifiable price today; the routine sends a no-data notice and stops |
| send | 3 | at least one channel skipped or failed (still prints which) |

## Data model

- `xishui_prices (trade_date, weight_jin)`: every band 30–45斤, plus the printed 昨日 price.
- `regional_quotes (trade_date, province, city, unit)`: one row per city clause from the 快报 articles, raw sentence kept.
- `reports (trade_date)`: the report markdown and parsed support/resistance zones.

## Tests

`npm test` runs the parsers against saved fixtures in `test/fixtures/`.
When jbzyw changes layout, save the new page into fixtures and fix the parser against it.
