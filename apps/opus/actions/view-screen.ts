import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { accessFilter } from "@agent-native/core/sharing";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema as tables } from "../server/db.js";

export default defineAction({
  description:
    "See the current Opus view or the open project, its transcript status, and saved clips.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as {
      view?: string;
      projectId?: string;
    } | null;
    if (!navigation) return "No application state found. Is the app running?";

    const screen: Record<string, unknown> = { navigation };
    const db = getDb();
    if (navigation.view === "project" && navigation.projectId) {
      const [project] = await db
        .select({
          id: tables.projects.id,
          title: tables.projects.title,
          transcriptStatus: tables.projects.transcriptStatus,
          durationMs: tables.projects.durationMs,
          captionStyle: tables.projects.captionStyle,
          aspect: tables.projects.aspect,
        })
        .from(tables.projects)
        .where(
          and(
            eq(tables.projects.id, navigation.projectId),
            accessFilter(tables.projects, tables.projectShares),
          ),
        )
        .limit(1);
      if (project) {
        screen.project = project;
        screen.clips = await db
          .select({
            id: tables.clips.id,
            title: tables.clips.title,
            startMs: tables.clips.startMs,
            endMs: tables.clips.endMs,
            score: tables.clips.score,
            reason: tables.clips.reason,
            source: tables.clips.source,
            status: tables.clips.status,
            aspect: tables.clips.aspect,
            captionStyle: tables.clips.captionStyle,
          })
          .from(tables.clips)
          .where(eq(tables.clips.projectId, project.id))
          .orderBy(asc(tables.clips.startMs));
      }
    } else {
      screen.projects = await db
        .select({
          id: tables.projects.id,
          title: tables.projects.title,
          transcriptStatus: tables.projects.transcriptStatus,
        })
        .from(tables.projects)
        .where(accessFilter(tables.projects, tables.projectShares))
        .orderBy(desc(tables.projects.updatedAt))
        .limit(20);
    }
    return screen;
  },
});
