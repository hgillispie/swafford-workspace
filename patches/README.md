# Dependency patches

Patches of `@agent-native/*` belong in this directory, must be registered in
the root `package.json` `pnpm.patchedDependencies`, and must be described here.

## Current

`@agent-native/core@0.201.0-nightly-20261005153421` patches `dist/deploy/build.js`:

- Keep `@img/sharp-linux-x64` when pruning serverless bundles. Sharp's glibc
  package name ends in `linux-x64`, which the stock pruner did not treat as a
  runnable Linux binary, so a Mac install shipped only darwin-arm64 and Assets
  crashed on Netlify.
- When `AGENT_NATIVE_SERVERLESS_FFMPEG_ARCH` is `x64` or `arm64`, bundle
  `ffmpeg-static` even if the build host is not that Linux arch. Apps that
  depend on it (clips, content) get a downloaded linux binary in the function
  copy. The host's own ffmpeg binary is left unchanged.

## Retired

`@agent-native/core@0.200.0` had a patch that made `isNeonUrl()` return false
when `AGENT_NATIVE_DB_DRIVER` was `postgres`, `postgres-js`, or `postgres.js`.
Netlify functions deadlocked Better Auth signup on the Neon WebSocket driver
because the serverless pool has one connection and signup asked for a second
one from inside its transaction. That deadlock is fixed in
`@agent-native/core@0.201.0-nightly-20261005153421` (upstream PR 6653), so the
patch and the env override are no longer used.
