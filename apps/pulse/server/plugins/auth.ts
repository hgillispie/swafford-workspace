import { createAuthPlugin } from "@agent-native/core/server";

export default createAuthPlugin({
  publicPaths: [
    "/_agent-native/actions/pulse-ingest",
    "/pulse/_agent-native/actions/pulse-ingest",
  ],
});
