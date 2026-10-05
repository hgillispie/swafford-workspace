import {
  bigint,
  boolean,
  createSharesTable,
  index,
  integer,
  now,
  ownableColumns,
  table,
  text,
  uniqueIndex,
} from "@agent-native/core/db/schema";

export const projects = table(
  "cutline_projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    mediaKind: text("media_kind"),
    mediaUrl: text("media_url"),
    mediaMimeType: text("media_mime_type"),
    mediaFilename: text("media_filename"),
    mediaSize: integer("media_size"),
    mediaBytes: bigint("media_bytes", { mode: "number" }),
    mediaProvider: text("media_provider"),
    mediaUploadId: text("media_upload_id"),
    sourceKey: text("source_key"),
    proxyKey: text("proxy_key"),
    dumpFileId: text("dump_file_id"),
    mediaWidth: integer("media_width"),
    mediaHeight: integer("media_height"),
    durationMs: integer("duration_ms").notNull().default(0),
    editedDurationMs: integer("edited_duration_ms").notNull().default(0),
    transcriptStatus: text("transcript_status").notNull().default("none"),
    transcriptError: text("transcript_error"),
    transcriptSource: text("transcript_source"),
    language: text("language"),
    speechPrint: text("speech_print").notNull().default(""),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [
    index("cutline_projects_owner_updated_idx").on(t.ownerEmail, t.updatedAt),
    index("cutline_projects_org_idx").on(t.orgId),
  ],
);

export const projectShares = createSharesTable("cutline_project_shares");

export const mediaUploads = table(
  "cutline_media_uploads",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    provider: text("provider").notNull(),
    sessionId: text("session_id").notNull(),
    sessionMeta: text("session_meta").notNull().default("{}"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull(),
    receivedBytes: bigint("received_bytes", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
  },
  (t) => [
    index("cutline_media_uploads_owner_idx").on(t.ownerEmail, t.createdAt),
  ],
);

export const projectSpeakers = table(
  "cutline_speakers",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
  },
  (t) => [index("cutline_speakers_project_idx").on(t.projectId)],
);

export const transcriptWords = table(
  "cutline_transcript_words",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    originalText: text("original_text"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    speakerId: text("speaker_id"),
    paragraphStart: boolean("paragraph_start").notNull().default(false),
    deleted: boolean("deleted").notNull().default(false),
    gapTrimMs: integer("gap_trim_ms").notNull().default(0),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
  },
  (t) => [
    uniqueIndex("cutline_transcript_words_project_position_idx").on(
      t.projectId,
      t.position,
    ),
  ],
);

/** Dumps library rows. Dumps owns the migration; Cutline reads and inserts uploads. */
export const libraryFiles = table(
  "dump_files",
  {
    id: text("id").primaryKey(),
    folderId: text("folder_id"),
    filename: text("filename").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    contentType: text("content_type"),
    uploaderEmail: text("uploader_email").notNull(),
    notes: text("notes"),
    tags: text("tags"),
    b2Key: text("b2_key").notNull(),
    uploadId: text("upload_id"),
    partSizeBytes: bigint("part_size_bytes", { mode: "number" }),
    status: text("status").notNull().default("uploading"),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("dump_files_org_status_idx").on(t.orgId, t.status)],
);

export const mediaJobs = table(
  "media_jobs",
  {
    id: text("id").primaryKey(),
    app: text("app").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    orgId: text("org_id"),
    ownerEmail: text("owner_email").notNull().default(""),
    subjectId: text("subject_id").notNull(),
    payload: text("payload").notNull().default("{}"),
    result: text("result"),
    progress: integer("progress").notNull().default(0),
    progressLabel: text("progress_label"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    heartbeatAt: bigint("heartbeat_at", { mode: "number" }),
    lockedBy: text("locked_by"),
    runAfter: bigint("run_after", { mode: "number" }).notNull().default(0),
    error: text("error"),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
  },
  (t) => [
    index("media_jobs_claim_idx").on(t.status, t.runAfter),
    index("media_jobs_subject_idx").on(t.app, t.subjectId),
  ],
);
