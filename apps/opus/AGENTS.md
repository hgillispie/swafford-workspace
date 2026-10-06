# Opus — Agent Guide

Opus turns a long video from the dumps bucket into scored vertical clips.
The media worker proxies, transcribes, and renders captioned clips. Moment
scoring goes through agent chat: page `list-moment-chunks`, rank globally,
then `save-opus-moments` (sentence-snapped). `score-moments-locally` is the
fallback and labels clips Local score. See `DESIGN.md` for the Cutroom direction.

## Skills

The default app skill surface is intentionally small. Promotion, learning,
translation, changelog, provider, and release workflows are optional; enable
the matching skill only when this app actually uses that workflow. The
`docs-search` action reads the version-matched framework docs bundled with
`@agent-native/core`; `source-search` reads core and first-party template
implementations. Prefer both over memory when package APIs, actions, or agent
surfaces are involved.

This app lives in the Swafford workspace at `apps/opus`. Tables are prefixed
`opus_`. Object storage is shared with Dumps. Jobs are rows in `media_jobs`.

## Core Rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Follow the root framework contract: data in SQL, actions first, application
  state for navigation/selection, and shared agent chat for AI work.
- Store large file/blob payloads in configured file/blob storage, not SQL: no
  base64, `data:` URLs, images, video/audio, PDFs, ZIPs, screenshots,
  thumbnails, or replay chunks in app tables, `application_state`, `settings`,
  or `resources`; persist URLs, ids, or handles instead.
- Never hardcode API keys, tokens, webhook URLs, signing secrets, private
  Builder/internal data, customer data, or credential-looking literals. Use
  secrets/OAuth/runtime configuration and obvious placeholders in examples.
- For external integrations, inspect the workspace/provider connection catalog
  first. Reuse an existing connection and its scoped credential resolver; only
  use app-local vault/OAuth/settings primitives when no reusable connection
  exists. Keep custom setup UI provider-specific and never duplicate storage.
- Keep actions deterministic and focused. Research, analysis, generation,
  recommendation, and synthesis start in the AgentSidebar and let the agent
  orchestrate its tools; follow-ups stay in the same thread rather than moving
  the user to a second freeform prompt box.
- Never fabricate. If an action fails or data is missing, say so and recover
  instead of inventing a result or claiming success.
- Verify a write before reporting it done — re-read the row or the screen.
- Use `view-screen` or application state when the active page/selection is
  unclear.

For a custom app, keep `server/plugins/config.ts` aligned with the product
brand. Its `app.name` is used in transactional emails, and its optional
`app.logoUrl` can point to an absolute HTTPS logo URL.

## Application State

- `navigation` describes the current `studio` view at `/` or `project` view
  at `/projects/:id` with its `projectId`. The right rail hosts the agent.
- `navigate` opens the studio or a project by id in the user's browser.
- `view-screen` is the first tool to call when the user's visible context
  matters; it returns the selected project and saved moment markers.

## Clip operations

| Action | Purpose |
| --- | --- |
| `list-opus-projects` | List projects the user can see. |
| `sync-opus-project` | Read one project, its transcript, jobs, and clips. |
| `list-moment-chunks` | Page the transcript in sentence chunks. Read every page before ranking. |
| `save-opus-moments` | Store the agent's global shortlist. Snaps ranges to sentences. |
| `score-moments-locally` | Deterministic fallback. Labels clips Local score. |
| `update-opus-clip` | Trim, aspect, caption style, font, position, or hook overlay. |
| `set-opus-captions` | Defaults copied onto clips saved after the change. |
| `render-opus-clip` | One worker job. One clip, or every saved clip, from one original download. |
| `open-opus-clip` / `open-opus-clips` | Presign one ready clip, or every ready clip. |

A clip is not rendered until `render-opus-clip` succeeds. Do not invent scores,
quotes, or download links. Agent moments are labeled Agent. Local fallback
moments are labeled Local score.

- `provider-api-request` calls Slack through the shared workspace connection.
  Use `provider: "slack"` and an exact Web API path such as `/auth.test`.
  Missing access pauses the run and opens the contextual connection card; do
  not ask the user to paste credentials or replace the request with prose.

## Source Changes

Before building common workspace or agent UI, read `agent-native-toolkit`; read
`customizing-agent-native` before adapting shared UI.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
