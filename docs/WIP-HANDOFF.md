# WIP handoff

No secret values in this note. Set credentials only in the host environment.

## Pulse fixed-org bearer ingest

**Goal.** Brandbot POSTs to `/pulse/_agent-native/actions/pulse-ingest` with a `PULSE_INGEST_SECRET` bearer and no browser session, and Matt does not paste JSON. Today that POST returns 503 `org_unresolved` because production has three organizations and a sessionless request cannot pick one.

**Done on this branch.**

- When `PULSE_INGEST_ORG_ID` is set to a 32-character hex organization id that exists in `organizations`, a sessionless bearer stores the report on that org.
- Idempotency on `reportDate:source` is done. Re-posting the same key replaces that report and its children. Card status is kept. Covered in `apps/pulse/actions/pulse-ingest.test.ts`.
- Inbox lists stored reports for the signed-in org. Paste is an owner/admin fallback, collapsed. Copy is for Matt and does not name env vars or API paths.
- Tests cover the configured org (three orgs present), the unset env var, and idempotency.

- Admin shows owners and admins a "Brandbot delivery" card with this workspace's id (copy button) and whether the env var points at it. Covered in `apps/pulse/actions/pulse-ingest.test.ts`.

**Unfinished (needs Hunter, not code).**

- `PULSE_INGEST_ORG_ID` is not set in this repo. Open Pulse → Admin, copy the workspace id from the Brandbot delivery card, and set it in the Netlify site environment, then redeploy. Until then, production bearer ingest still 503s `org_unresolved`. After the redeploy the card reads "delivered on their own". Nothing in the repo can set a Netlify env var.

**Guarded.**

- The fixed-org path runs only when `PULSE_INGEST_ORG_ID` is set.
- When that variable is unset, the previous lookup stays: request organization, otherwise the only organization, otherwise 503 `org_unresolved`.
- A set value with the wrong shape, or an id that is not in the database, returns 503 and does not fall back.
- The variable is not declared as a required production env, so readiness checks stay as they were until it is set.
- Inbox changes on this branch are complete and are not behind the env gate.

## Scout dummyproof UX + Keywords link

**Not started.** The agent for it stopped after only reading code. No Scout files were changed for this.

**Intended scope.** Make Scout foolproof for Matt: clear empty and first-run states, plain-language guidance, and obvious next actions. Add a link to Keywords.
