import { createAuthPlugin } from "@agent-native/core/server";

export default createAuthPlugin({
  publicPaths: [
    "/api/worker/transcribe",
    "/opus/api/worker/transcribe",
  ],
});
