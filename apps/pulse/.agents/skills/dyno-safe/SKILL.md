---
name: dyno-safe
description: Keep Pulse dyno-safe until a Hunter admin unlocks dyno. Use when drafting cards, keywords, ideas, or ingest enforcement.
---

# Dyno-safe

`pulse_settings.dyno_unlocked` is the only unlock. A Brandbot payload cannot
override a locked admin flag. On conflict, the admin toggle wins.

While locked:

- `dynoSafe` stays true.
- Do not write dyno hero claims: dyno'd, dyno sheet, dyno tune, dyno numbers,
  “put it on the dyno.”
- “Didn’t need a dyno room” is allowed. “Dyna” the bike is allowed.

Use `pulse-set-settings` only for an owner or admin.
