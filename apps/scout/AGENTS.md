# Scout — Agent Guide

Scout is the live TikTok research app at `/scout`. Pulse stays Brandbot ingest and Matt's shoot cards. Do not add ScrapeCreators calls to Pulse.

## Skills

Read `scout-guardrails` before recreates, audits, or brand copy. Framework skills stay opt-in. `docs-search` and `source-search` are the version-matched docs.

## Product

- Home is the niche pulse: breakouts, trend terms, watchlist, filters. Its header always carries a "Search keywords" link next to Refresh pulse.
- Home has three states, decided by `homeState` in `shared/guidance.ts`: no key and nothing stored shows only an "Add the key in Settings" panel; a key and nothing stored shows only a "Run first pulse" panel (no filters, no empty lists); anything stored shows the full board. Keep first-run copy to one sentence and one button.
- Every empty list says what to do next: clear filters, run the pulse, or open Keywords. Plain words over jargon: "fades in about N days", "its usual views", "demand (estimate)". Volume and competition stay labeled as estimates.
- A keyword seed button runs the search. `/keywords?term=` runs it on arrival.
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
