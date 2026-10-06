import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { readProject } from "../server/lib/access.js";
import { presignGet } from "../server/lib/b2.js";

export default defineAction({
  description: "Presign every ready clip in a project for download.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
  }),
  http: { method: "GET" },
  run: async ({ id }) => {
    await readProject(id);
    const clips = await getDb()
      .select()
      .from(schema.clips)
      .where(eq(schema.clips.projectId, id));
    const ready = clips
      .filter((clip) => clip.status === "ready" && clip.outputKey)
      .sort((a, b) => a.startMs - b.startMs);
    const signed = await Promise.all(
      ready.map(async (clip) => {
        const filename = `${clip.title.replace(/[^\w.-]+/g, "-").slice(0, 60) || "clip"}.mp4`;
        const file = await presignGet({
          key: clip.outputKey as string,
          filename,
          contentType: "video/mp4",
          disposition: "attachment",
        });
        return { clipId: clip.id, title: clip.title, url: file.url };
      }),
    );
    return { clips: signed };
  },
});
