import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject } from "../server/lib/access.js";
import {
  ASPECTS,
  CAPTION_FONTS,
  CAPTION_POSITIONS,
  CAPTION_STYLES,
} from "../server/lib/clip-look.js";
import { parseWords } from "../server/lib/words.js";

export default defineAction({
  description:
    "Nudge or set one clip's trim, aspect, caption style, font, position, or hook overlay. Clears a finished render so it can be regenerated.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    clipId: z.string().min(1),
    startMs: z.number().int().min(0).optional(),
    endMs: z.number().int().min(1).optional(),
    nudgeStartMs: z.number().int().min(-15000).max(15000).optional(),
    nudgeEndMs: z.number().int().min(-15000).max(15000).optional(),
    aspect: z.enum(ASPECTS).optional(),
    captionStyle: z.enum(CAPTION_STYLES).optional(),
    captionFont: z.enum(CAPTION_FONTS).optional(),
    captionPosition: z.enum(CAPTION_POSITIONS).optional(),
    hookOverlay: z.boolean().optional(),
  }),
  run: async ({
    id,
    clipId,
    startMs,
    endMs,
    nudgeStartMs,
    nudgeEndMs,
    aspect,
    captionStyle,
    captionFont,
    captionPosition,
    hookOverlay,
  }) => {
    const project = await editProject(id);
    const db = getDb();
    const [clip] = await db
      .select()
      .from(schema.clips)
      .where(and(eq(schema.clips.id, clipId), eq(schema.clips.projectId, id)))
      .limit(1);
    if (!clip) {
      fail("Clip not found.", { statusCode: 404, errorCode: "not_found" });
    }
    const words = parseWords(project.wordsJson);
    const duration = Math.max(
      project.durationMs,
      words[words.length - 1]?.endMs ?? 0,
    );
    const nextStart = Math.max(
      0,
      (startMs ?? clip.startMs) + (nudgeStartMs ?? 0),
    );
    const nextEnd = Math.max(0, (endMs ?? clip.endMs) + (nudgeEndMs ?? 0));
    if (nextEnd <= nextStart + 1500) {
      fail("A clip needs more than a second and a half.", {
        statusCode: 400,
        errorCode: "bad_range",
      });
    }
    if (duration > 0 && nextEnd > duration + 1500) {
      fail("That trim is past the end of the video.", {
        statusCode: 400,
        errorCode: "bad_range",
      });
    }
    if (nextEnd - nextStart > 180_000) {
      fail("Keep a clip under three minutes.", {
        statusCode: 400,
        errorCode: "bad_range",
      });
    }
    const [row] = await db
      .update(schema.clips)
      .set({
        startMs: nextStart,
        endMs: nextEnd,
        aspect: aspect ?? clip.aspect,
        captionStyle: captionStyle ?? clip.captionStyle,
        captionFont: captionFont ?? clip.captionFont,
        captionPosition: captionPosition ?? clip.captionPosition,
        hookOverlay:
          hookOverlay === undefined ? clip.hookOverlay : hookOverlay ? 1 : 0,
        status: "draft",
        outputKey: null,
        jobId: null,
        error: null,
      })
      .where(eq(schema.clips.id, clip.id))
      .returning({
        id: schema.clips.id,
        startMs: schema.clips.startMs,
        endMs: schema.clips.endMs,
        aspect: schema.clips.aspect,
        captionStyle: schema.clips.captionStyle,
        captionFont: schema.clips.captionFont,
        captionPosition: schema.clips.captionPosition,
        hookOverlay: schema.clips.hookOverlay,
        status: schema.clips.status,
      });
    return row;
  },
});
