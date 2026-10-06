# Cutline — Agent Guide

Cutline is a text-based video editor. Footage comes from the shared dumps
bucket (or a new multipart upload into that bucket). The media worker makes a
720p proxy and a word-level transcript. Deleting words cuts the edit. Export
queues a full-quality MP4 from the original file. See `DESIGN.md` for the
Fair Copy direction.

## Skills

The default app skill surface is intentionally small. Promotion, learning,
translation, changelog, provider, and release workflows are optional; enable
the matching skill only when this app actually uses that workflow. The
`docs-search` action reads the version-matched framework docs bundled with
  `@agent-native/core`; `source-search` reads core and first-party template
  implementations. Prefer both over memory when package APIs, actions, or agent
  surfaces are involved.

This app lives in the Swafford workspace at `apps/cutline`. Tables are
prefixed `cutline_`. Shared object storage is `@swafford-workspace/object-storage`.
Media jobs live in `media_jobs` and are claimed by `services/media-worker`.

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

## Data model

- `projects` (ownable, with `project_shares`): title, media URL/kind/size,
  source `duration_ms`, cached `edited_duration_ms` and `speech_print`, and
  `transcript_status` (`none` | `processing` | `ready` | `failed`).
- `transcript_words`: one row per word with `position` (0-based, unique per
  project), `start_ms`/`end_ms`, `speaker_id`, `paragraph_start`, `deleted`
  (cut from the edit), `gap_trim_ms` (silence removed after the word), and
  `original_text` when corrected.
- `project_speakers`: speaker names per project.
- Media bytes live in the framework file-upload provider (Builder.io or S3);
  SQL stores only the URL. Transcription uses Builder.io's transcription
  service. Shared editing logic lives in `shared/transcript.ts`.

## Actions

| Action | Use it to |
| --- | --- |
| `list-projects` | List owned and shared projects (optional `query`). |
| `create-project` / `update-project` / `delete-project` | Create, rename or attach media (`mediaUrl`), delete (confirm with the user first). |
| `transcribe-project` | Transcribe attached media (replaces the transcript and edits). |
| `get-transcript` | Read numbered sentences with inclusive word positions; page with `fromSentence`. |
| `find-in-transcript` | Find a phrase and get exact `from`/`to` positions. |
| `set-words-deleted` | Cut (`deleted: true`) or restore word ranges. |
| `remove-filler-words` | Cut um/uh/… (or the given `fillers`); `dryRun` previews counts. |
| `shorten-gaps` | Shorten pauses longer than `maxGapMs`; `clear` restores them. |
| `correct-word` | Fix one word's text without touching media. |
| `update-speaker` | Rename a speaker. |
| `export-transcript` | Edited transcript as `txt`, `srt`, or `vtt`. |
| `view-screen` / `navigate` | See the open project and selection; open `/projects/:id`. |

`get-project`, `patch-words` (editor undo/redo), and `create-sample-project`
are UI-only. Generative work (show notes, titles, chapters, clips) happens in
chat, grounded in `get-transcript` output with timecodes.

## Application State

- `navigation`: `{ view, path, projectId? }`. Views: `projects` (`/`),
  `editor` (`/projects/:projectId`), `shared`, `templates`, and `brand-kit`
  (placeholders), and `settings`.
- `selection` (editor only): `{ kind: "transcript", projectId, from, to, text }`
  for the words the user selected; `view-screen` returns it with a
  `set-words-deleted` hint.
- `navigate` moves the UI; `view-screen` is the first tool to call when the
  user's visible context matters.
- `provider-api-request` calls Slack through the shared workspace connection.
  Use `provider: "slack"` and an exact Web API path such as `/auth.test`.
  Missing access pauses the run and opens the contextual connection card; do
  not ask the user to paste credentials or replace the request with prose.

## Source Changes

Before building common workspace or agent UI, read `agent-native-toolkit`; read
`customizing-agent-native` before adapting shared UI.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
