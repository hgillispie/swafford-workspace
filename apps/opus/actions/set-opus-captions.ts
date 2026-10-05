import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject, nowIso } from "../server/lib/access.js";

export default defineAction({
  description: "Set the caption style and font used when rendering vertical clips.",
  schema: z.object({
    id: z.string().min(1),
    captionStyle: z.enum(["karaoke", "bold", "minimal", "phrase"]),
    captionFont: z.enum(["dejavu", "liberation", "noto"]),
  }),
  run: async ({ id, captionStyle, captionFont }) => {
    await editProject(id);
    await getDb()
      .update(schema.projects)
      .set({ captionStyle, captionFont, updatedAt: nowIso() })
      .where(eq(schema.projects.id, id));
    return { captionStyle, captionFont };
  },
});
