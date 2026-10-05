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

export const runOpusMigrations = runMigrations(
  [
    {
      version: 1,
      name: "opus-library",
      sql: `CREATE TABLE IF NOT EXISTS opus_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_key TEXT,
  proxy_key TEXT,
  dump_file_id TEXT,
  media_filename TEXT,
  media_mime_type TEXT,
  media_bytes BIGINT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  media_width INTEGER,
  media_height INTEGER,
  transcript_status TEXT NOT NULL DEFAULT 'none',
  transcript_error TEXT,
  transcript_source TEXT,
  language TEXT,
  words_json TEXT NOT NULL DEFAULT '[]',
  caption_style TEXT NOT NULL DEFAULT 'karaoke',
  caption_font TEXT NOT NULL DEFAULT 'dejavu',
  youtube_url TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE INDEX IF NOT EXISTS opus_projects_owner_updated_idx ON opus_projects (owner_email, updated_at);
CREATE INDEX IF NOT EXISTS opus_projects_org_idx ON opus_projects (org_id);
CREATE TABLE IF NOT EXISTS opus_project_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS opus_clips (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  hook INTEGER NOT NULL DEFAULT 0,
  engagement INTEGER NOT NULL DEFAULT 0,
  value_score INTEGER NOT NULL DEFAULT 0,
  shareability INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'agent',
  status TEXT NOT NULL DEFAULT 'draft',
  output_key TEXT,
  job_id TEXT,
  error TEXT,
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS opus_clips_project_idx ON opus_clips (project_id, start_ms);`,
    },
    {
      version: 2,
      name: MEDIA_JOBS_MIGRATION_NAME,
      sql: MEDIA_JOBS_SQL,
    },
  ],
  { table: "opus_migrations" },
);

export default (nitroApp: { h3?: unknown }): void => {
  void (async () => {
    await runOpusMigrations(nitroApp);
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
