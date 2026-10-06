# Visual Design Contract

`AGENTS.md` is the canonical statement of the blank-canvas rule — check
`app/routes/_index.tsx` and `app/global.css`, preserve any real UI/brand
already there, and only treat the canvas as blank when those files still show
the starter's placeholder. This file does not restate that rule; it records
**this app's** visual direction. The fields below are the source of truth for
that direction: once filled in, read and preserve them on every build; while
they are still empty, the first substantial UI pass fills them in.

## Non-negotiable: impress by default

When this app is still a blank canvas, every app generated from this template
must look **spectacular on first load**, even when the build prompt gives no
design direction. "Looks like a clean, intentional product" is the floor, not
the goal. When no direction is supplied, you still commit to one — do not
default to safe gray SaaS:

- Commit to one concrete visual world (see the `frontend-design` skill and its
  `references/visual-direction.md`). Do not ship the neutral placeholder theme.
- Choose a product-fitting accent family and set it in the `app/global.css`
  tokens for **both** light and dark. Never leave the 0%-saturation default as
  the shipped palette.
- Establish a clear type hierarchy, a consistent spacing rhythm, and one
  signature detail (a considered empty state, a distinctive header, a crafted
  primary action) that makes the surface feel designed for its domain.
- Get focus, hover, empty, loading, and dark-mode states right — that polish is
  the difference between an AI demo and a product.

Pick a direction and execute it fully; never average toward generic SaaS. Once
a direction is established and recorded below, preserve and extend it rather
than starting over unless otherwise directed to.

## Fill in before building the first surface

Once the fields below are filled in, they describe this app's established
visual direction — read and preserve them on every subsequent build; do not
re-derive a new direction. The first UI pass must fill these fields in as
part of that build, not leave them as an empty template.

- Product mode: `operate`
- Audience and cadence: Podcasters, video creators, and content teams who edit
  talking-head video and audio several times a week in long, focused sessions.
  They think in words, not frames: the transcript is the edit.
- Visual world (name + the feeling it creates): **Fair Copy** — a quiet
  manuscript desk. The script reads like crisp type on a pale page; chrome
  around it stays ink-quiet and gets out of the way. Calm, legible,
  unhurried — nothing competes with the words.
- Palette family + neutral undertone: **Paper / charcoal** family. Neutrals are
  a cool paper white (hue ~210, low saturation, never warm beige/cream) with
  charcoal-ink text. A single restrained "ink" accent (`--primary` 222°, deep
  and desaturated, not a vivid brand color) marks the primary action, playhead,
  selection, and current-word highlight — never a gradient. Six muted,
  desaturated speaker hues (teal, clay, rose, sky, moss, ochre) identify voices
  in the script and timeline without competing with the ink accent. Red is
  reserved for destructive actions only. Dark mode is charcoal ink (not pure
  black) with a lifted card surface and a lighter ink-blue accent.
- Type treatment: Sans-first, Inter Variable only. Chrome runs at 13px/12px
  medium weight; the script is the hero at 17px with a 1.8 line height and a
  ~68ch measure; timecodes use tabular numerals. No display face, no serif, no
  uppercase eyebrows.
- Composition: Two surfaces. **Projects** is a calm library grid under a slim
  header with one primary action. **Editor** is a focused workbench with no
  left rail: script canvas (primary, left/center), media preview + transport
  (right column), timeline strip (bottom), and the agent rail on demand at the
  far right.
- Shape language: Quiet utility geometry — 8px radius on cards and controls,
  6px on inner thumbnails, hairline borders, flat surfaces (no heavy shadows,
  no glass). Signature details: a "speech print" barcode thumbnail drawn from
  transcript timing, a restrained ink marker gliding under the spoken word, and
  hatched strikethrough cuts — all rendered quietly, without glow or motion for
  its own sake.
- Anti-references (defaults this app must not drift toward): purple-gradient AI
  SaaS, glassmorphism, neon "gamer" NLE chrome, card-heavy dashboards with stat
  strips, sparkle/wand AI icons, marketing hero copy inside the app, warm
  beige/terracotta, heavy drop shadows or skeuomorphic chrome.

## Agent-native is structural, not visual

This shell already meets the Agent-Native contract: data in SQL, actions as the
single source of truth, application state for navigation/selection, and
real-time sync. **Chat and the agent rail are opt-in, not default.** Build the
product UI first. Add an `AgentSidebar`, a full-page chat route, or
`sendToAgentChat` handoffs only when the user asks for agent interaction — and
when you do, follow `agent-native-toolkit` and `frontend-design` → Agent
Surface And Page Boundaries so the surfaces are wired correctly.

## Guardrails

- Keep semantic token names and shared component seams intact; express the
  direction through token *values*, type, spacing, and composition — not by
  forking the design system.
- Density comes from data, not prose. Subtract explanatory chrome; never
  subtract the visual craft that makes the app impressive.
- Compare against real products in the chosen mode, not against the starter.
