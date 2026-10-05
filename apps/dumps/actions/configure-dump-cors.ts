import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { ensureBucketCors } from "../server/lib/b2.js";
import { failB2, requireActor } from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Set the private bucket CORS rule with PutBucketCors. Allows the production site and localhost dev origins, methods GET, PUT, HEAD, and POST, header *, and exposes ETag.",
  schema: z.object({}),
  run: async () => {
    requireActor();
    try {
      const cors = await ensureBucketCors(true);
      return {
        ok: cors.ok,
        origins: cors.origins,
        methods: ["GET", "PUT", "HEAD", "POST"],
        exposeHeaders: ["ETag"],
        message: cors.ok
          ? "Bucket CORS allows the site and localhost to upload and play files."
          : (cors.message ?? "Bucket CORS was not updated."),
      };
    } catch (err) {
      failB2(err);
    }
  },
});
