import { defineAction, fail } from "@agent-native/core/action";
import { deleteUploadedFile } from "@agent-native/core/file-upload";
import { assertAccess, resolveAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireUserEmail, type ProjectRow } from "../server/lib/projects.js";

export default defineAction({
  description:
    "Permanently delete a project, its transcript, speakers, and share grants. Only the owner or a share admin can delete.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
  }),
  run: async ({ id }) => {
    requireUserEmail();
    if (!(await resolveAccess("project", id))) {
      fail("Project not found.", { statusCode: 404, errorCode: "not_found" });
    }
    const { resource } = await assertAccess("project", id, "admin");
    const project = resource as ProjectRow;
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.transcriptWords)
        .where(eq(schema.transcriptWords.projectId, id));
      await tx
        .delete(schema.projectSpeakers)
        .where(eq(schema.projectSpeakers.projectId, id));
      await tx
        .delete(schema.projectShares)
        .where(eq(schema.projectShares.resourceId, id));
      await tx.delete(schema.projects).where(eq(schema.projects.id, id));
    });
    if (project.mediaUrl && project.mediaProvider) {
      await deleteUploadedFile(project.mediaProvider, {
        url: project.mediaUrl,
        id: project.mediaUploadId ?? undefined,
      }).catch((error) => {
        console.warn(
          "[cutline] media cleanup failed",
          error instanceof Error ? error.message : error,
        );
      });
    }
    return { id, title: project.title, deleted: true };
  },
});
