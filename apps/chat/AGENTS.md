# Chat — Agent Guide

Chat is the workspace's general-purpose assistant. Signed-in members use it
for free-form conversation: notes, writing, brainstorming, and everyday
questions. It is not the workspace admin. Dispatch owns organization setup,
the vault, app installation, and integrations.

The public root opens the shared sign-in page. Signed-in members land on
`/home`, which opens a chat thread. Full-page chat stays at `/chat/:threadId`.

Model access uses the workspace Builder connection already configured for
this deploy. Do not ask anyone to paste an API key, and do not add a new
provider env var.

## Skills

The default app skill surface is intentionally small. Promotion, learning,
translation, changelog, provider, and release workflows are optional; enable
the matching skill only when this app actually uses that workflow. The
`docs-search` action reads the version-matched framework docs bundled with
`@agent-native/core`; `source-search` reads core and first-party template
implementations. Prefer both over memory when package APIs, actions, or agent
surfaces are involved.

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
  recommendation, and synthesis stay in this chat thread. Do not send the
  member to a second freeform prompt box.
- Never fabricate. If an action fails or data is missing, say so and recover
  instead of inventing a result or claiming success.
- Verify a write before reporting it done — re-read the row or the screen.
- Use `view-screen` or application state when the active page/selection is
  unclear.
- Do not invent Swafford-specific tools. Answer from the conversation. The
  template actions below are the whole product surface.

`server/plugins/agent-native-email-branding.ts` sets `app.name` to Chat for
transactional email. Do not point it at another product.

## Application State

- `navigation` describes the current view. The default chat view is `chat` at
  `/home` and `/chat/:threadId`. `/` opens the shared sign-in page.
- `navigate` moves the UI when the member asks to open a thread or settings.
- `view-screen` is the first tool to call when the user's visible context
  matters.
- `provider-api-request` calls Slack through the shared workspace connection
  only when the member asks for Slack. Use `provider: "slack"` and an exact
  Web API path such as `/auth.test`. Missing access pauses the run and opens
  the contextual connection card; do not ask the user to paste credentials.

## Actions

| Action | Purpose |
| --- | --- |
| `view-screen` | Read the current navigation state. |
| `navigate` | Open a chat thread, view, or path. |
| `hello` | Template greeting. Not a product workflow. |
| `provider-api-request` | Slack Web API, only when the member asks. |

## Source Changes

Before building common workspace or agent UI, read `agent-native-toolkit`; read
`customizing-agent-native` before adapting shared UI.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
