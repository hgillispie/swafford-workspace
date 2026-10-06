import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { readProject } from "../server/lib/access.js";
import { presignGet } from "../server/lib/b2.js";

export default defineAction({
  description: "Presign a finished vertical clip for download.",
  schema: z.object({
    id: z.string().min(1),
    clipId: z.string().min(1),
  }),
  http: { method: "GET" },
  run: async ({ id, clipId }) => {
    await readProject(id);
    const [clip] = await getDb()
      .select()
      .from(schema.clips)
      .where(and(eq(schema.clips.id, clipId), eq(schema.clips.projectId, id)))
      .limit(1);
    if (!clip?.outputKey || clip.status !== "ready") {
      fail("That clip is not ready.", {
        statusCode: 409,
        errorCode: "not_ready",
      });
    }
    const signed = await presignGet({
      key: clip.outputKey,
      filename: `${clip.title.replace(/[^\w.-]+/g, "-").slice(0, 60) || "clip"}.mp4`,
      contentType: "video/mp4",
      disposition: "attachment",
    });
    return { url: signed.url };
  },
});
