/**
 * See what the user is currently looking at on screen.
 *
 * Usage:
 *   pnpm action view-screen
 */

import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { accessFilter, resolveAccess } from "@agent-native/core/sharing";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  loadSpeakers,
  loadWords,
  mediaDuration,
  type ProjectRow,
} from "../server/lib/projects.js";
import { buildComposition, formatTimecode } from "../shared/transcript.js";

interface NavigationState {
  view?: string;
  projectId?: string;
  path?: string;
}

interface SelectionState {
  kind?: string;
  projectId?: string;
  from?: number;
  to?: number;
  text?: string;
}

export default defineAction({
  description:
    "See what the user is currently looking at: the current view (projects, editor, settings, …), the open project with its durations, speakers, and transcript status, and any selected transcript words (with positions). Call this first when the request depends on the screen.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState(
      "navigation",
    )) as NavigationState | null;
    if (!navigation) return "No application state found. Is the app open?";
    const screen: Record<string, unknown> = { navigation };

    if (navigation.view === "editor" && navigation.projectId) {
      const access = await resolveAccess("project", navigation.projectId);
      if (!access) {
        screen.project = null;
        return screen;
      }
      const project = access.resource as ProjectRow;
      const [words, speakers] = await Promise.all([
        loadWords(project.id),
        loadSpeakers(project.id),
      ]);
      const duration = mediaDuration(project, words);
      screen.project = {
        id: project.id,
        title: project.title,
        role: access.role,
        hasMedia: !!project.mediaUrl,
        mediaKind: project.mediaKind,
        isSample: project.isSample,
        transcriptStatus: project.transcriptStatus,
        transcriptError: project.transcriptError,
        sourceDuration: formatTimecode(duration),
        editedDuration: formatTimecode(
          buildComposition(words, duration).durationMs,
        ),
        words: words.length,
        cutWords: words.filter((w) => w.deleted).length,
        speakers: speakers.map((s) => ({ id: s.id, name: s.name })),
      };
      const selection = (await readAppState(
        "selection",
      )) as SelectionState | null;
      if (
        selection?.kind === "transcript" &&
        selection.projectId === project.id
      ) {
        screen.selection = selection;
        screen.nextRequiredAction = "set-words-deleted";
        screen.nextArgs = {
          projectId: project.id,
          ranges: [{ from: selection.from, to: selection.to }],
          deleted: true,
        };
      }
      return screen;
    }

    if (navigation.view === "projects") {
      const db = getDb();
      const rows = await db
        .select({
          id: schema.projects.id,
          title: schema.projects.title,
          transcriptStatus: schema.projects.transcriptStatus,
          editedDurationMs: schema.projects.editedDurationMs,
          updatedAt: schema.projects.updatedAt,
        })
        .from(schema.projects)
        .where(accessFilter(schema.projects, schema.projectShares))
        .orderBy(desc(schema.projects.updatedAt))
        .limit(20);
      screen.projects = rows.map((row) => ({
        id: row.id,
        title: row.title,
        transcriptStatus: row.transcriptStatus,
        editedDuration: formatTimecode(row.editedDurationMs),
        updatedAt: row.updatedAt,
      }));
    }

    return screen;
  },
});
