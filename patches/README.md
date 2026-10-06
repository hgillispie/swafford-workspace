# Dependency patches

Patches of `@agent-native/*` belong in this directory, must be registered in
the root `package.json` `pnpm.patchedDependencies`, and must be described here.

## Current

`@agent-native/dispatch@0.40.12-nightly-20261005153421` patches
`isWorkspaceAppVisibleInDefaultLaunchers` in `src/lib/workspace-apps.ts` and
the published `dist/lib/workspace-apps.js`:

- Dispatch's apps list and app rail hide every app whose id is `chat`, which
  was meant to drop the hosted starter at `https://chat.agent-native.com`.
  This workspace has a real mounted app at `/chat`. The filter still hides
  Dispatch and the hosted starter, and it lists a path-mounted `chat` app.

`@agent-native/core@0.201.0-nightly-20261005153421` patches `dist/deploy/build.js`:

- Keep only glibc linux-x64 native packages when pruning serverless bundles:
  napi-rs `*-linux-x64-gnu` and sharp's `@img/sharp-linux-x64`. The stock
  pruner treated musl and arm64 as runnable too, so a Mac install that
  downloaded every arch shipped four `@napi-rs/canvas` binaries and Slides
  exceeded the Netlify function budget. Sharp's musl packages are named
  `linuxmusl-*` (no hyphen), so the platform matcher includes that spelling
  and deletes them once a glibc binary is present. Without the `linux-x64`
  suffix, sharp's glibc package was not treated as runnable and Assets
  crashed on Netlify with only a darwin binary left.
- When `AGENT_NATIVE_SERVERLESS_FFMPEG_ARCH` is `x64` or `arm64`, bundle
  `ffmpeg-static` even if the build host is not that Linux arch. Apps that
  depend on it (clips, content) get a downloaded linux binary in the function
  copy. The host's own ffmpeg binary is left unchanged.
- `dist/cli/doctor.js`: the build hook used to print "fix them before the
  build can continue" for every finding, before it checked the gate. Netlify
  sets `CI=true`, but that variable is not a strict toggle. The build fails
  only when `agent-native build --strict` is passed or
  `agent-native.json` has `doctor.failOnBuild: true` (the default). Workspace
  apps set `failOnBuild` to false because the template findings are reviewed
  false positives (`process.env` deploy flags and child tables scoped through
  a parent). The patch prints the abort banner only when the build will exit,
  and otherwise logs that the build is continuing.

## Retired

`@agent-native/core@0.200.0` had a patch that made `isNeonUrl()` return false
when `AGENT_NATIVE_DB_DRIVER` was `postgres`, `postgres-js`, or `postgres.js`.
Netlify functions deadlocked Better Auth signup on the Neon WebSocket driver
because the serverless pool has one connection and signup asked for a second
one from inside its transaction. That deadlock is fixed in
`@agent-native/core@0.201.0-nightly-20261005153421` (upstream PR 6653), so the
patch and the env override are no longer used.
