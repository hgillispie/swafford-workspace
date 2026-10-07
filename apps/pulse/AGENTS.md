# Swafford Pulse — agent guide

Same rules as `AGENTS.md` in this app.

Pulse is the TikTok content desk at `/pulse`. Brandbot ingests research.
Matt copies paste packs into Descript and CapCut. LLM work stays in agent
chat. Dyno stays locked until a Hunter admin unlocks it. Recreates are
original shoots. Soft CTAs only.

Bearer ingest (`pulse-ingest`) stores reports on `PULSE_INGEST_ORG_ID`.
Do not guess an organization when the request has no session. Inbox copy is
for Matt: reports arrive from Brandbot, and pasting is an admin fallback.
Do not mention vault secrets, env vars, or request paths in that copy.
