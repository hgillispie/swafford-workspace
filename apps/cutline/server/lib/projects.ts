import { fail } from "@agent-native/core/action";
import {
  getRequestOrgId,
  getRequestUserEmail,
} from "@agent-native/core/server/request-context";
import { assertAccess, resolveAccess } from "@agent-native/core/sharing";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { ProjectSummary } from "../../shared/project.js";
import {
  computeSpeechPrint,
  buildComposition,
  type TranscriptSpeaker,
  type TranscriptWord,
  type WordPatch,
} from "../../shared/transcript.js";
import { getDb, schema } from "../db.js";

export type ProjectRow = typeof schema.projects.$inferSelect;
export type { ProjectSummary };

export function requireUserEmail(): string {
  const email = getRequestUserEmail();
  if (!email)
    fail("Sign in to continue.", {
      statusCode: 401,
      errorCode: "unauthenticated",
    });
  return email;
}

export function currentOrgId(): string | null {
  return getRequestOrgId() ?? null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toSummary(row: ProjectRow): ProjectSummary {
  const me = getRequestUserEmail();
  return {
    id: row.id,
    title: row.title,
    mediaKind:
      row.mediaKind === "video" || row.mediaKind === "audio"
        ? row.mediaKind
        : null,
    mediaUrl: row.mediaUrl,
    mediaMimeType: row.mediaMimeType,
    mediaFilename: row.mediaFilename,
    mediaSize: row.mediaBytes ?? row.mediaSize,
    mediaWidth: row.mediaWidth,
    mediaHeight: row.mediaHeight,
    durationMs: row.durationMs,
    editedDurationMs: row.editedDurationMs,
    transcriptStatus: (["none", "processing", "ready", "failed"].includes(
      row.transcriptStatus,
    )
      ? row.transcriptStatus
      : "none") as ProjectSummary["transcriptStatus"],
    transcriptError: row.transcriptError,
    transcriptSource: row.transcriptSource,
    language: row.language,
    speechPrint: row.speechPrint,
    isSample: row.isSample,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ownerEmail: row.ownerEmail,
    ownedByMe: !!me && row.ownerEmail.toLowerCase() === me.toLowerCase(),
    visibility: row.visibility,
  };
}

export async function readProject(id: string): Promise<ProjectRow> {
  requireUserEmail();
  const access = await resolveAccess("project", id);
  if (!access)
    fail("Project not found.", { statusCode: 404, errorCode: "not_found" });
  return access.resource as ProjectRow;
}

export async function editProject(id: string): Promise<ProjectRow> {
  requireUserEmail();
  const visible = await resolveAccess("project", id);
  if (!visible)
    fail("Project not found.", { statusCode: 404, errorCode: "not_found" });
  const access = await assertAccess("project", id, "editor");
  return access.resource as ProjectRow;
}

export async function loadWords(projectId: string): Promise<TranscriptWord[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.transcriptWords.id,
      position: schema.transcriptWords.position,
      text: schema.transcriptWords.text,
      originalText: schema.transcriptWords.originalText,
      startMs: schema.transcriptWords.startMs,
      endMs: schema.transcriptWords.endMs,
      speakerId: schema.transcriptWords.speakerId,
      paragraphStart: schema.transcriptWords.paragraphStart,
      deleted: schema.transcriptWords.deleted,
      gapTrimMs: schema.transcriptWords.gapTrimMs,
    })
    .from(schema.transcriptWords)
    .where(eq(schema.transcriptWords.projectId, projectId))
    .orderBy(asc(schema.transcriptWords.position));
  return rows;
}

export async function loadSpeakers(
  projectId: string,
): Promise<TranscriptSpeaker[]> {
  const db = getDb();
  return db
    .select({
      id: schema.projectSpeakers.id,
      name: schema.projectSpeakers.name,
      position: schema.projectSpeakers.position,
    })
    .from(schema.projectSpeakers)
    .where(eq(schema.projectSpeakers.projectId, projectId))
    .orderBy(asc(schema.projectSpeakers.position));
}

/** Recompute the cached edited duration and speech print after an edit. */
export async function refreshDerived(project: ProjectRow): Promise<ProjectRow> {
  const [words, speakers] = await Promise.all([
    loadWords(project.id),
    loadSpeakers(project.id),
  ]);
  const duration = Math.max(
    project.durationMs,
    words[words.length - 1]?.endMs ?? 0,
  );
  const composition = buildComposition(words, duration);
  const db = getDb();
  const [row] = await db
    .update(schema.projects)
    .set({
      editedDurationMs: Math.round(composition.durationMs),
      speechPrint: computeSpeechPrint(words, speakers, duration),
      updatedAt: nowIso(),
    })
    .where(eq(schema.projects.id, project.id))
    .returning();
  return row ?? project;
}

/** Apply word patches with as few UPDATE statements as possible. */
export async function applyWordPatches(
  projectId: string,
  patches: WordPatch[],
): Promise<number> {
  if (patches.length === 0) return 0;
  const db = getDb();
  const groups = new Map<
    string,
    { set: Record<string, unknown>; positions: number[] }
  >();
  for (const patch of patches) {
    const set: Record<string, unknown> = {};
    if (patch.deleted !== undefined) set.deleted = patch.deleted;
    if (patch.gapTrimMs !== undefined)
      set.gapTrimMs = Math.max(0, Math.round(patch.gapTrimMs));
    if (patch.text !== undefined) set.text = patch.text;
    if (Object.keys(set).length === 0) continue;
    const key = JSON.stringify(set);
    const group = groups.get(key) ?? { set, positions: [] };
    group.positions.push(patch.position);
    groups.set(key, group);
  }
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const { set, positions } of groups.values()) {
      for (let i = 0; i < positions.length; i += 500) {
        const chunk = positions.slice(i, i + 500);
        const rows = await tx
          .update(schema.transcriptWords)
          .set(set)
          .where(
            and(
              eq(schema.transcriptWords.projectId, projectId),
              inArray(schema.transcriptWords.position, chunk),
            ),
          )
          .returning({ id: schema.transcriptWords.id });
        changed += rows.length;
      }
    }
  });
  return changed;
}

export interface NewTranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
  speakerKey: string | null;
  paragraphStart: boolean;
}

/** Replace a project's transcript (speakers + words) atomically. */
export async function replaceTranscript(
  project: ProjectRow,
  speakers: Array<{ key: string; name: string }>,
  words: NewTranscriptWord[],
): Promise<void> {
  const db = getDb();
  const speakerIds = new Map<string, string>();
  const speakerRows = speakers.map((speaker, position) => {
    const id = crypto.randomUUID();
    speakerIds.set(speaker.key, id);
    return {
      id,
      projectId: project.id,
      name: speaker.name,
      position,
      ownerEmail: project.ownerEmail,
      orgId: project.orgId,
    };
  });
  const wordRows = words.map((word, position) => ({
    id: crypto.randomUUID(),
    projectId: project.id,
    position,
    text: word.text,
    startMs: Math.max(0, Math.round(word.startMs)),
    endMs: Math.max(Math.round(word.startMs), Math.round(word.endMs)),
    speakerId: word.speakerKey
      ? (speakerIds.get(word.speakerKey) ?? null)
      : null,
    paragraphStart: position === 0 ? true : word.paragraphStart,
    deleted: false,
    gapTrimMs: 0,
    ownerEmail: project.ownerEmail,
    orgId: project.orgId,
  }));
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.transcriptWords)
      .where(eq(schema.transcriptWords.projectId, project.id));
    await tx
      .delete(schema.projectSpeakers)
      .where(eq(schema.projectSpeakers.projectId, project.id));
    if (speakerRows.length > 0)
      await tx.insert(schema.projectSpeakers).values(speakerRows);
    for (let i = 0; i < wordRows.length; i += 400) {
      await tx
        .insert(schema.transcriptWords)
        .values(wordRows.slice(i, i + 400));
    }
  });
}

export function mediaDuration(
  project: ProjectRow,
  words: TranscriptWord[],
): number {
  return Math.max(project.durationMs, words[words.length - 1]?.endMs ?? 0);
}

export async function commitEdit(
  project: ProjectRow,
  plan: { before: WordPatch[]; after: WordPatch[] },
) {
  const changed = await applyWordPatches(project.id, plan.after);
  const row = changed > 0 ? await refreshDerived(project) : project;
  return {
    changed,
    editedDurationMs: row.editedDurationMs,
    before: plan.before,
    after: plan.after,
  };
}

export function requireTranscript(words: TranscriptWord[]) {
  if (words.length === 0) {
    fail("This project has no transcript yet.", {
      errorCode: "no_transcript",
      statusCode: 409,
    });
  }
}
