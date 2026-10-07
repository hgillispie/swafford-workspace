# Swafford Pulse

TikTok content intelligence and shoot cards for Swafford Speed. Mounted at
`/pulse`. Nav label: Pulse.

Matt uses **This week** to skim the latest pulse and copy paste packs (caption,
CapCut scene outline, Descript chapter/VO beats, camera notes) into the real
Descript and CapCut apps. Pulse does not edit video.

Brandbot is the v1 research worker. Pulse Postgres is the source of truth.
PDFs stay in Drive; reports store Drive file ids.

## Brandbot ingest

POST the JSON document (schema `1.0`, not wrapped) to:

```text
https://<workspace-origin>/pulse/_agent-native/actions/pulse-ingest
Authorization: Bearer <PULSE_INGEST_SECRET>
Content-Type: application/json
```

The bearer call has no session. It stores the report on the organization in
`PULSE_INGEST_ORG_ID` and does not look at other organizations. Set that
deploy env var to one `organizations.id`: 32 hex characters, no dashes (a
UUID with the hyphens removed). Case is normalized to lowercase. If the
variable is missing, blank, or not that shape, ingest returns 503 and does
not choose an organization, even when the database has only one. Do not
commit the value. Set it in the Netlify site environment.

Idempotency key is `idempotencyKey` or `{reportDate}:{source}` (`tiktok` or
`youtube`). Re-posting the same key replaces that report and its children.
Card status (`open` / `filmed` / `skipped`) and backlog status past `idea`
are kept.

`PULSE_INGEST_SECRET` is server-only. Add it in Dispatch vault (workspace
secret, not required) or as a deploy env var for the unauthenticated Brandbot
POST. Do not commit it. Signed-in members can also call the action; that
path stores the report on their own organization.

The contract example in the Brandbot doc has one recreate card. The schema
requires at least two. `fixtures/pulse-2026-10-05-tiktok.json` is a valid
local payload (the Oct 5 shape plus a water-pump card).

Signed-in members of the ingest organization see the stored report on
**This week** and the other desks. No paste step.

## Admin paste fallback

Owners and admins can paste report text from **Inbox**. The control stays
collapsed. Pulse does not download Drive bytes. A file id alone is recorded
as not fetched.

## Dyno

Hunter admin toggle (`Admin`, owners and admins) wins over
`brand.dynoUnlocked` in the payload.

## Account audit

Paste a TikTok URL or handle. The audit reads stored Brandbot snapshots only.
It does not call TikTok Login Kit and it does not scrape. Missing handles stay
empty on purpose. Limits are listed on the audit page.

## Local checks

```bash
pnpm --filter pulse typecheck
pnpm --filter pulse test
```
