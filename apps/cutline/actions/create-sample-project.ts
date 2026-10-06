import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  currentOrgId,
  nowIso,
  refreshDerived,
  replaceTranscript,
  requireUserEmail,
  toSummary,
} from "../server/lib/projects.js";
import { buildSampleTranscript } from "../shared/sample-project.js";

export default defineAction({
  description:
    "Create a sample project with a two-speaker podcast transcript (no media attached) for trying the editor.",
  schema: z.object({}),
  agentTool: false,
  run: async () => {
    const ownerEmail = requireUserEmail();
    const sample = buildSampleTranscript();
    const db = getDb();
    const now = nowIso();
    const [row] = await db
      .insert(schema.projects)
      .values({
        id: crypto.randomUUID(),
        title: sample.title,
        durationMs: sample.durationMs,
        editedDurationMs: sample.durationMs,
        transcriptStatus: "ready",
        transcriptSource: "sample",
        language: "en",
        isSample: true,
        ownerEmail,
        orgId: currentOrgId(),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await replaceTranscript(
      row,
      sample.speakers,
      sample.words.map((word) => ({ ...word, speakerKey: word.speakerKey })),
    );
    return toSummary(await refreshDerived(row));
  },
});
