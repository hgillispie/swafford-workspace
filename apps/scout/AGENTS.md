# Scout — Agent Guide

Scout is the live TikTok research app at `/scout`. Pulse stays Brandbot ingest and Matt's shoot cards. Do not add ScrapeCreators calls to Pulse.

## Skills

Read `scout-guardrails` before recreates, audits, or brand copy. Framework skills stay opt-in. `docs-search` and `source-search` are the version-matched docs.

## Product

- Home is the niche pulse: breakouts, trend terms, watchlist, filters.
- A cold Niche pulse (key set, every watchlist row unfetched) auto-runs `scout-intelligence-report` once, then waits 30 minutes. It does not re-fire after rows are fetched or marked missing.
- A ScrapeCreators not-found on one handle is a skip. The rest of the pulse still saves. `warning` names the handles. Do not tell the user to link TikTok or Instagram.
- A single Watch shows “Watching…” on that row, then refreshes the list. The error stays on the row when the fetch fails.
- Instagram and Shorts stay stubs. TikTok search does not need account linking.
- Keywords, competitors, trends, audit, timing, create, and recreates are the working routes.
- Actions stay deterministic. Rewrite, audit narrative, and the pulse brief go through the AgentSidebar with high effort and the strongest configured model. Do not call `generateText` or `streamText`. Do not default to mini, flash, or haiku.
- One-click recreate saves a structural CapCut/Descript paste pack, then `scout-save-recreate` stores the rewritten lines.
- Dyno stays locked until `scout-set-brand` sets `dynoUnlocked`. Soft booking CTAs. Original shoots only. Do not rip footage.
- Volume and competition figures are proxies. Say so. Do not invent Google Ads numbers, shadowban status, or a reach oracle.
- Sound names are observed on fetched videos, not a live chart.
- Brand defaults are Swafford seeds in `shared/brand.ts` and can be replaced with `scout-set-brand`.

## Data

`SCRAPECREATORS_API_KEY` comes from `resolveSecret`, then the deploy env var. Never print the key. Cache normalized rows in `scout_*` tables. Do not store video file bytes.

Rate-limit copy is exactly `data provider rate-limited`.

## Actions

`scout-search-keywords`, `scout-search-hashtags`, `scout-fetch-competitor`, `scout-watch-seeds`, `scout-discover-trends`, `scout-audit-page`, `scout-intelligence-report`, `scout-recreate`, `scout-save-recreate`, `scout-draft-copy`, `scout-save-draft`, `scout-best-time`, `scout-list`, `scout-provider-status`, `scout-save-audit`, `scout-save-report`, `scout-set-brand`, `scout-send-to-pulse`.
