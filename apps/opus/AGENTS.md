# Opus — Agent Guide

Opus turns a long video from the dumps bucket into scored vertical clips.
The media worker proxies, transcribes, and renders 9:16 MP4s. Moment scoring
goes through agent chat (`save-opus-moments`). `score-moments-locally` is an
explicit offline fallback. See `DESIGN.md` for the Cutroom direction.

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

| Action                | Purpose                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `list-clip-projects`  | List visible saved YouTube sources.                                                                         |
| `create-clip-project` | Save a source with `title` and `sourceUrl`; return the id and `urlPath`.                                    |
| `get-clip-project`    | Read a project and its saved moment markers by `id`.                                                        |
| `update-clip-project` | Rename an accessible project by `id` and `title`.                                                           |
| `create-clip-moment`  | Save a proposed range using `projectId`, `title`, integer `startSeconds`/`endSeconds`, and optional `note`. |
| `delete-clip-moment`  | Remove a moment marker by `id`.                                                                             |

A saved source or moment is not a processed clip. There is no download,
transcription, scoring, rendering, or export pipeline yet. Never claim those
steps succeeded or fabricate a clip preview. Project records are private by
default and can be shared with the standard share control.

- `provider-api-request` calls Slack through the shared workspace connection.
  Use `provider: "slack"` and an exact Web API path such as `/auth.test`.
  Missing access pauses the run and opens the contextual connection card; do
  not ask the user to paste credentials or replace the request with prose.

## Source Changes

Before building common workspace or agent UI, read `agent-native-toolkit`; read
`customizing-agent-native` before adapting shared UI.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
