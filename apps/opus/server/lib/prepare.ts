import { eq } from "drizzle-orm";

import { getDb, schema } from "../db.js";
import { nowIso, type ProjectRow } from "./access.js";
import { enqueueMediaJob } from "./jobs.js";

export async function enqueuePrepare(project: ProjectRow): Promise<void> {
  if (!project.sourceKey) return;
  await getDb()
    .update(schema.projects)
    .set({
      transcriptStatus: "processing",
      transcriptError: null,
      updatedAt: nowIso(),
    })
    .where(eq(schema.projects.id, project.id));
  const base = `opus/${project.id}`;
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
