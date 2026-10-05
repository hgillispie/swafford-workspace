import {
  ensureAdditiveColumns,
  getDbExec,
  runMigrations,
} from "@agent-native/core/db";

import "../db/index.js";
import * as schema from "../db/schema.js";

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

export const runDumpsMigrations = runMigrations(
  [
    {
      version: 1,
      name: "dumps-library-tables",
      sql: `CREATE TABLE IF NOT EXISTS dump_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS dump_folders_org_idx ON dump_folders (org_id);
CREATE INDEX IF NOT EXISTS dump_folders_parent_idx ON dump_folders (parent_id);
CREATE TABLE IF NOT EXISTS dump_files (
  id TEXT PRIMARY KEY,
  folder_id TEXT,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  content_type TEXT,
  uploader_email TEXT NOT NULL,
  notes TEXT,
  tags TEXT,
  b2_key TEXT NOT NULL,
  upload_id TEXT,
  status TEXT NOT NULL DEFAULT 'uploading',
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS dump_files_org_folder_idx ON dump_files (org_id, folder_id);
CREATE INDEX IF NOT EXISTS dump_files_org_status_idx ON dump_files (org_id, status);
CREATE TABLE IF NOT EXISTS dump_shares (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE UNIQUE INDEX IF NOT EXISTS dump_shares_token_idx ON dump_shares (token);
CREATE INDEX IF NOT EXISTS dump_shares_file_idx ON dump_shares (file_id);
CREATE INDEX IF NOT EXISTS dump_shares_org_idx ON dump_shares (org_id);`,
    },
    {
      version: 2,
      name: "dumps-file-part-size",
      sql: `ALTER TABLE dump_files ADD COLUMN IF NOT EXISTS part_size_bytes BIGINT;`,
    },
  ],
  { table: "dumps_migrations" },
);

export default (nitroApp: { h3?: unknown }): void => {
  void (async () => {
    await runDumpsMigrations(nitroApp);
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
