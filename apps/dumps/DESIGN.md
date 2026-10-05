# Visual Design Contract

Dumps is a private file ledger. The library is the product; chat is the
secondary surface.

## Product mode

- Mode: `operate`
- Audience and cadence: people dropping large files into a shared private bucket.
- Primary workflow: add files, then find, preview, or share one of them.

Contract: `operate / workspace member / drop a file into the library / see it land in the current folder`.

## Visual direction

- Direction name: Warehouse ledger
- Palette family: warm stone surfaces, ink text, one oxidized-copper accent.
- Type treatment: sans-serif throughout. Dense table type. No display serif.
- Composition: one drop zone, a path, a search field, then the file table.
  File details open only after a row is selected.
- Shape language: tight radius, hairline borders, a single copper progress bar.
- Anti-references: sparkle or robot icons, card grids of files, starter chat
  copy, and a second upload form beside the drop zone.

## Guardrails

- Preserve semantic tokens. The copper accent is `--primary`.
- Keep `/chat` available without turning `/home` into a chat canvas.
- Tabler icons only.
