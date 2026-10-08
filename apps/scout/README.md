# Scout

TikTok niche intelligence for a shop that films original shoots. Mounted at `/scout`.

Search, competitors, trends, audits, and paste packs run through actions. The agent writes hooks, scripts, captions, audit notes, and the pulse brief. Scout does not call a model inline.

## Environment

`SCRAPECREATORS_API_KEY` is the ScrapeCreators key for live TikTok reads.

- Add it in Settings, or set the same name as a deploy env var (Netlify).
- The vault value wins when it is set.
- Until the key exists, Scout shows `SCRAPECREATORS_API_KEY` with a link to Settings and will still serve fresh or stale cache.
- A live fetch with no key and no cache returns a clear missing-key error. The key itself is never returned or logged.

No other Scout-specific secret is required. Auth and Postgres are the shared workspace Neon database. Do not add an app-local `DATABASE_URL`.

## What is live

- Niche pulse (home): breakouts, trend terms, watchlist, search/trend, geo, and dyno-safe filters
- Keyword finder and hashtag search
- Competitor profile, recent videos, hook and CTA patterns, observed sound names
- Trend discovery (two seed keywords plus the trending feed)
- Account audit
- One-click recreate paste packs for CapCut and Descript
- Hook, script, and caption previews
- Best time to post from fetched timestamps, America/New_York
- Optional send of a recreate into the Pulse backlog

Instagram and YouTube Shorts routes exist and say they are not connected.

Scheduled digests, a labeled view predictor, bio optimizer, sound-suggestion product, a Scout-local backlog, and MCP polish are later. Scout does not ship a shadowban checker, a view oracle, a hardcoded music chart, or a video editor.

## Develop

From the workspace root:

```bash
pnpm install
pnpm --filter scout typecheck
pnpm --filter scout test
pnpm dev
```

Open `/scout`.
