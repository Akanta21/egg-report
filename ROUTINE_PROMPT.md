# Routine prompt

Paste this into the Instructions box at claude.ai/code/routines.
Keep it thin. The scripts are deterministic; the only judgement step is the analysis.

```
You are running the daily Farmio 浠水45斤 egg price update.

1. Run `npm run scrape`.
   - Exit 0: continue.
   - Exit 2: run `npm run send -- --no-data`, print its output, and stop. Do not write a report. Do not estimate a price.
   - Any other failure: print the error and stop.
2. Run `npm run context > /tmp/ctx.json`.
3. Read /tmp/ctx.json and write today's report to /tmp/report.md following .claude/skills/egg-update/SKILL.md exactly.
   - Traditional Chinese. Use **bold**, no # headers.
   - Do not invent prices. Do not fill gaps. If ctx.today_recorded is false, stop.
   - Compare against ctx.previous_report and state what actually changed.
4. Run `npm run send -- /tmp/report.md`.
5. Run `npm run save -- /tmp/report.md`.
6. Print the last 5 lines of output from steps 1, 4 and 5.
```
