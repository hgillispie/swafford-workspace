# Swafford Workspace Workspace Instructions

These instructions apply to every app in the Swafford Workspace workspace. Keep
only rules that should be shared across all apps here. App-specific behavior
belongs in that app's own `AGENTS.md` or `.agents/skills/` directory.

## Skills

Read the matching skill in `.agents/skills/` before working in that area.

| Skill | Read before |
| --- | --- |
| `workspace-conventions` | Shared vs app-owned code, file/blob storage, env and secrets, scratch files, Dispatch Resources |
| `adding-a-feature` | Adding a cross-cutting feature or capability |
| `agent-native-docs` | Looking up version-matched framework docs, slugs, or the optional source corpus |
| `agent-native-toolkit` | Building workspace or agent UI, app chrome, settings, sharing, or collaboration |
| `customizing-agent-native` | Adapting, overriding, or ejecting shared framework UI |
| `delegate-to-agent` | Building agent-driven UI or any "AI" feature |
| `actions` | Adding or changing an app operation the agent and UI share |
| `frontend-design` | Any user-facing UI change |
| `real-time-sync` | Keeping UI queries current after agent or action writes |
| `shadcn-ui` | Adding, updating, or debugging a shadcn/ui primitive |
| `security`, `sharing` | Access scoping, ownable data, and sharing user-authored resources |
| `secrets`, `storing-data` | Credentials or persisted application data |
| `self-modifying-code` | Agent-editable app source and protected paths |

This is the complete default inherited set. Feature flags, translations,
changelogs, integrations, automations, A2A workflows, and release/promotion
helpers stay available as opt-in skills for the apps that use them.

## Shared Context

Add company, product, compliance, or support-context notes that every app
agent should know.

## Adding an app

Do exactly this and nothing else:

1. From inside `swafford-workspace`, run
   `npx @agent-native/core@latest add-app <app-name> --template <template-id>`.
2. First-party template ids only, unless a later instruction gives a pinned
   public community repo (`community:owner/repo#<ref>`). Never install `mail`,
   `calendar`, or `forms` unless explicitly asked.
3. Add the new id to `agent-native.builtinAgents.include` in the root
   `package.json` (mode stays `"selected"`).
4. Run `pnpm install` at the workspace root, then `pnpm dev`. The new app
   inherits this shared package, the root `.env`, the shared `DATABASE_URL`,
   and the existing login. Do not create a new repo, a new auth secret, an
   `apps/<name>/.env` with its own `DATABASE_URL`, or a separate origin.
5. When the workspace is deployed, use one origin via
   `npx @agent-native/core@latest deploy` so the session stays shared. Do not
   deploy each app on its own domain.

## Core Rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- All AI/LLM behavior goes through the app's agent chat. UI and server code must
  not call model providers or AI SDK `generateText()` / `streamText()` directly;
  use `sendToAgentChat()`. Keep actions deterministic and focused. Research,
  analysis, generation, recommendation, and synthesis open the AgentSidebar with
  `sendToAgentChat({ openSidebar: true })` and stay in the same thread — never a
  second freeform textbox. Read `delegate-to-agent` first.
- Keep domain workflows on named routes and preserve the scaffold's full-page
  chat route.
- Keep first viewport focused: one primary action, progressive disclosure, and
  domain navigation; never use sparkle, wand, magic, or robot icons.
- Data loads use layout-matching `Skeleton` geometry, never a
  generic "Loading..." label. Reserve `Spinner` for brief mutations, uploads,
  and progress actions.
- Before visual work, read `frontend-design` and the workspace/app `DESIGN.md`.
  Keep shared chrome semantic and neutral, then choose an app-specific visual
  direction and palette family instead of copying a sibling app by default.
- Every AI-labeled button must call `sendToAgentChat()` with
  `openSidebar: true`; label deterministic local actions as local or preview.
- Normal app data must flow through actions. Define `defineAction` files in
  `actions/`, mark reads with `http: { method: "GET" }`, and call them from React
  with `useActionQuery` / `useActionMutation`. Do not add `/api/*` routes that
  duplicate, wrap, proxy, or re-export an action.
- Keep app-specific screens, actions, state, and skills inside `apps/<app>`. Put
  shared code in `packages/shared` only when multiple apps need it.
- App database code must be PostgreSQL-specific: `@agent-native/core/db/schema`
  helpers plus Drizzle's PostgreSQL query builder. Never import raw schema-driver
  packages from an app.
- SQL is for structured records, metadata, references, and searchable text.
  Large files and blob payloads belong in configured file/blob storage; persist
  only URLs, ids, or handles.
- Never hardcode API keys, tokens, webhook URLs, signing secrets, private
  Builder/internal data, customer data, or credential-looking literals anywhere,
  including application state, action responses, and generated app content. Use
  secrets/OAuth/runtime configuration and obvious placeholders.
- Never hardcode `localhost`, `127.0.0.1`, or a dev port. Use relative workspace
  links like `/<app-name>`; the workspace gateway origin owns the port.
- Do not implement a new app by adding routes, pages, or files to `apps/chat` or
  another existing app unless the user explicitly asks to modify that app. Read
  `adding-workspace-apps` first.
- Prefer framework defaults until the workspace has a real custom rule,
  component, plugin, action, or skill to share.
- Before building common workspace or agent UI, read `agent-native-toolkit` to
  inventory existing public kits and installed package seams. Read
  `customizing-agent-native` before adapting shared UI: configure → compose →
  eject the smallest unit → propose a shared seam. Never edit `node_modules`.

## Framework Docs

Core ships version-matched docs; optional `@agent-native/core-corpus` adds
template source to `source-search`. From an app directory, use `pnpm action
docs-search --query "<topic>"` or `pnpm action source-search --query
"<pattern>"`. See `workspace-conventions` for slugs, flags, and the `rg`
fallback. Use package docs for APIs and this file plus `.agents/skills/` for
workspace conventions.

## Actions

| Action | Purpose |
| --- | --- |
| `docs-search` | Search version-matched framework docs by query or slug, or list |
| `source-search` | Search Core/Toolkit sources and optional template corpus by pattern or path |

- For external integrations, check the provider connection catalog first; reuse
  its scoped resolver before app-local vault/OAuth/settings. Custom UI is for
  provider readiness only, never duplicate credential storage.
