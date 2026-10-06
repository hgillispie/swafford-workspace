import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject, nowIso } from "../server/lib/access.js";
import {
  ASPECTS,
  CAPTION_FONTS,
  CAPTION_POSITIONS,
  CAPTION_STYLES,
} from "../server/lib/clip-look.js";

export default defineAction({
  description:
    "Set the caption, aspect, and hook-overlay defaults copied onto new clips.",
  schema: z.object({
    id: z.string().min(1),
    captionStyle: z.enum(CAPTION_STYLES),
    captionFont: z.enum(CAPTION_FONTS),
    captionPosition: z.enum(CAPTION_POSITIONS).default("bottom"),
    aspect: z.enum(ASPECTS).default("9:16"),
    hookOverlay: z.boolean().default(true),
  }),
  run: async ({ id, captionStyle, captionFont, captionPosition, aspect, hookOverlay }) => {
    await editProject(id);
    await getDb()
      .update(schema.projects)
      .set({
        captionStyle,
        captionFont,
        captionPosition,
        aspect,
        hookOverlay: hookOverlay ? 1 : 0,
        updatedAt: nowIso(),
      })
      .where(eq(schema.projects.id, id));
    return { captionStyle, captionFont, captionPosition, aspect, hookOverlay };
  },
});
