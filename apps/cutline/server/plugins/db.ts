import {
  ensureAdditiveColumns,
  getDbExec,
  runMigrations,
} from "@agent-native/core/db";
import {
  MEDIA_JOBS_MIGRATION_NAME,
  MEDIA_JOBS_SQL,
} from "@swafford-workspace/media-core";

import "../db.js";
import * as schema from "../../drizzle/schema.js";

function isDrizzleTable(value: unknown): value is object {
  return (
    !!value &&
    typeof value === "object" &&
    Object.getOwnPropertySymbols(value).some((symbol) =>
      symbol.toString().includes("drizzle"),
    )
  );
}

const schemaTables = Object.values(schema).filter(isDrizzleTable);

export const runCutlineMigrations = runMigrations(
  [
    {
      version: 1,
      name: "cutline-library",
      sql: `CREATE TABLE IF NOT EXISTS cutline_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  media_kind TEXT,
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  media_size INTEGER,
  media_bytes BIGINT,
  media_provider TEXT,
  media_upload_id TEXT,
  source_key TEXT,
  proxy_key TEXT,
  dump_file_id TEXT,
  media_width INTEGER,
  media_height INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  edited_duration_ms INTEGER NOT NULL DEFAULT 0,
  transcript_status TEXT NOT NULL DEFAULT 'none',
  transcript_error TEXT,
  transcript_source TEXT,
  language TEXT,
  speech_print TEXT NOT NULL DEFAULT '',
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE INDEX IF NOT EXISTS cutline_projects_owner_updated_idx ON cutline_projects (owner_email, updated_at);
CREATE INDEX IF NOT EXISTS cutline_projects_org_idx ON cutline_projects (org_id);
CREATE TABLE IF NOT EXISTS cutline_project_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS cutline_media_uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_meta TEXT NOT NULL DEFAULT '{}',
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  total_bytes BIGINT NOT NULL,
  received_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE INDEX IF NOT EXISTS cutline_media_uploads_owner_idx ON cutline_media_uploads (owner_email, created_at);
CREATE TABLE IF NOT EXISTS cutline_speakers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE INDEX IF NOT EXISTS cutline_speakers_project_idx ON cutline_speakers (project_id);
CREATE TABLE IF NOT EXISTS cutline_transcript_words (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  original_text TEXT,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  speaker_id TEXT,
  paragraph_start BOOLEAN NOT NULL DEFAULT false,
  deleted BOOLEAN NOT NULL DEFAULT false,
  gap_trim_ms INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS cutline_transcript_words_project_position_idx ON cutline_transcript_words (project_id, position);`,
    },
    {
      version: 2,
      name: MEDIA_JOBS_MIGRATION_NAME,
      sql: MEDIA_JOBS_SQL,
    },
  ],
  { table: "cutline_migrations" },
);

export default (nitroApp: { h3?: unknown }): void => {
  void (async () => {
    await runCutlineMigrations(nitroApp);
    try {
      const summary = await ensureAdditiveColumns({
        db: getDbExec(),
        tables: schemaTables,
      });
      if (summary.errors.length > 0) {
        console.warn(
          "[db] ensureAdditiveColumns completed with errors:",
          summary.errors,
        );
      }
    } catch (err) {
      console.warn(
        "[db] ensureAdditiveColumns failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }
  })();
};
