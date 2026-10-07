import { runMigrations } from "@agent-native/core/db";

const sql = `CREATE TABLE IF NOT EXISTS scout_settings (
  id TEXT PRIMARY KEY,
  brand_json TEXT NOT NULL DEFAULT '{}',
  dyno_unlocked BOOLEAN NOT NULL DEFAULT false,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS scout_settings_org_idx ON scout_settings (org_id);
CREATE TABLE IF NOT EXISTS scout_cache (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  query TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  cursor TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE UNIQUE INDEX IF NOT EXISTS scout_cache_org_key_idx ON scout_cache (org_id, cache_key);
CREATE INDEX IF NOT EXISTS scout_cache_org_kind_idx ON scout_cache (org_id, kind);
CREATE TABLE IF NOT EXISTS scout_competitors (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'watch',
  notes TEXT,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE UNIQUE INDEX IF NOT EXISTS scout_competitors_org_handle_idx ON scout_competitors (org_id, handle);
CREATE TABLE IF NOT EXISTS scout_audits (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  narrative TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS scout_audits_org_idx ON scout_audits (org_id, created_at);
CREATE TABLE IF NOT EXISTS scout_reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  packet_json TEXT NOT NULL,
  narrative TEXT,
  status TEXT NOT NULL DEFAULT 'packet',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS scout_reports_org_kind_idx ON scout_reports (org_id, kind, created_at);
CREATE TABLE IF NOT EXISTS scout_recreates (
  id TEXT PRIMARY KEY,
  source_video_id TEXT,
  source_handle TEXT,
  source_url TEXT,
  card_json TEXT NOT NULL,
  paste_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS scout_recreates_org_idx ON scout_recreates (org_id, created_at);
CREATE TABLE IF NOT EXISTS scout_drafts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  topic TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS scout_drafts_org_idx ON scout_drafts (org_id, created_at);`;

export const runScoutMigrations = runMigrations(
  [{ version: 1, name: "scout-cache-tables", sql }],
  { table: "scout_migrations" },
);
