import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject, nowIso } from "../server/lib/projects.js";

export default defineAction({
  description:
    'Rename a speaker label in a project\'s transcript (e.g. "Speaker 1" to "Maya").',
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    speakerId: z.string().min(1).describe("Speaker id from get-transcript"),
    name: z.string().trim().min(1).max(80).describe("New speaker name"),
  }),
  run: async ({ projectId, speakerId, name }) => {
    await editProject(projectId);
    const db = getDb();
    const [row] = await db
      .update(schema.projectSpeakers)
      .set({ name })
      .where(
        and(
          eq(schema.projectSpeakers.projectId, projectId),
          eq(schema.projectSpeakers.id, speakerId),
        ),
      )
      .returning({
        id: schema.projectSpeakers.id,
        name: schema.projectSpeakers.name,
      });
    if (!row)
      fail("Speaker not found.", { statusCode: 404, errorCode: "not_found" });
    await db
      .update(schema.projects)
      .set({ updatedAt: nowIso() })
      .where(eq(schema.projects.id, projectId));
    return row;
  },
});
