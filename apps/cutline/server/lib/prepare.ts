import { eq } from "drizzle-orm";

import { getDb, schema } from "../db.js";
import { enqueueMediaJob } from "./media-jobs.js";
import { nowIso, type ProjectRow } from "./projects.js";

export async function enqueuePrepare(project: ProjectRow): Promise<void> {
  if (!project.sourceKey) return;
  const db = getDb();
  await db
    .update(schema.projects)
    .set({
      transcriptStatus: "processing",
      transcriptError: null,
      updatedAt: nowIso(),
    })
    .where(eq(schema.projects.id, project.id));
  const base = `cutline/${project.id}`;
  await enqueueMediaJob({
    kind: "proxy",
    subjectId: project.id,
    orgId: project.orgId,
    ownerEmail: project.ownerEmail,
    payload: {
      sourceKey: project.sourceKey,
      outputKey: `${base}/proxy.mp4`,
    },
  });
  await enqueueMediaJob({
    kind: "extract-audio",
    subjectId: project.id,
    orgId: project.orgId,
    ownerEmail: project.ownerEmail,
    payload: {
      sourceKey: project.sourceKey,
      outputPrefix: `${base}/audio`,
      chunkSeconds: 600,
      chainTranscribe: true,
    },
  });
}
