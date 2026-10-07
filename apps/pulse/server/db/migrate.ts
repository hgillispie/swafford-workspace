import { runMigrations } from "@agent-native/core/db";

const sql = `CREATE TABLE IF NOT EXISTS pulse_settings (
  id TEXT PRIMARY KEY,
  dyno_unlocked BOOLEAN NOT NULL DEFAULT false,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_settings_org_idx ON pulse_settings (org_id);
CREATE TABLE IF NOT EXISTS pulse_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  source TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  headline TEXT NOT NULL,
  matt_blurb TEXT NOT NULL,
  hunter_notes TEXT NOT NULL,
  window_days INTEGER,
  pdf_drive_file_id TEXT,
  pdf_drive_url TEXT,
  xlsx_drive_file_id TEXT,
  methodology TEXT,
  brand_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  data_gaps_json TEXT NOT NULL DEFAULT '[]',
  growth_tags_json TEXT NOT NULL DEFAULT '[]',
  local_notes TEXT,
  payload_dyno_unlocked BOOLEAN NOT NULL DEFAULT false,
  effective_dyno_unlocked BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE UNIQUE INDEX IF NOT EXISTS pulse_reports_idem_idx ON pulse_reports (org_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS pulse_reports_date_source_idx ON pulse_reports (org_id, report_date, source);
CREATE INDEX IF NOT EXISTS pulse_reports_org_date_idx ON pulse_reports (org_id, report_date);
CREATE TABLE IF NOT EXISTS pulse_ingest_runs (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  schema_version TEXT,
  received_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_ingest_runs_org_idx ON pulse_ingest_runs (org_id, received_at);
CREATE TABLE IF NOT EXISTS pulse_trends (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  classification TEXT NOT NULL,
  half_life_days DOUBLE PRECISION,
  search_vs_trend TEXT NOT NULL,
  dyno_safe BOOLEAN NOT NULL DEFAULT true,
  pillar TEXT,
  geo TEXT,
  why_now TEXT,
  examples_json TEXT NOT NULL DEFAULT '[]',
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_trends_report_idx ON pulse_trends (report_id);
CREATE TABLE IF NOT EXISTS pulse_keywords (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  term TEXT NOT NULL,
  intent TEXT NOT NULL,
  search_vs_trend TEXT NOT NULL,
  dyno_safe BOOLEAN NOT NULL DEFAULT true,
  pillar TEXT NOT NULL,
  geo TEXT,
  volume_proxy TEXT,
  competition_proxy TEXT,
  evergreen BOOLEAN NOT NULL DEFAULT true,
  seed_library BOOLEAN NOT NULL DEFAULT false,
  related_json TEXT NOT NULL DEFAULT '[]',
  examples_json TEXT NOT NULL DEFAULT '[]',
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_keywords_org_idx ON pulse_keywords (org_id, term);
CREATE INDEX IF NOT EXISTS pulse_keywords_report_idx ON pulse_keywords (report_id);
CREATE TABLE IF NOT EXISTS pulse_competitors (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  section TEXT NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL,
  followers INTEGER,
  total_likes INTEGER,
  posts_per_week DOUBLE PRECISION,
  median_views DOUBLE PRECISION,
  max_views INTEGER,
  follower_like_health_pct DOUBLE PRECISION,
  geo TEXT,
  notes TEXT,
  hook_patterns_json TEXT NOT NULL DEFAULT '[]',
  cta_patterns_json TEXT NOT NULL DEFAULT '[]',
  sample_json TEXT NOT NULL DEFAULT '{}',
  top_videos_json TEXT NOT NULL DEFAULT '[]',
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_competitors_report_idx ON pulse_competitors (report_id, section);
CREATE TABLE IF NOT EXISTS pulse_videos (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_video_id TEXT,
  url TEXT NOT NULL,
  handle TEXT NOT NULL,
  caption TEXT,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  duration_sec INTEGER,
  sound_name TEXT,
  outlier_score DOUBLE PRECISION,
  search_vs_trend TEXT,
  geo TEXT,
  dyno_safe BOOLEAN NOT NULL DEFAULT true,
  payload_json TEXT NOT NULL DEFAULT '{}',
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_videos_org_url_idx ON pulse_videos (org_id, url);
CREATE UNIQUE INDEX IF NOT EXISTS pulse_videos_platform_id_idx ON pulse_videos (org_id, platform, platform_video_id) WHERE platform_video_id IS NOT NULL AND platform_video_id <> '';
CREATE TABLE IF NOT EXISTS pulse_recreate_cards (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  card_key TEXT NOT NULL,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  on_screen_text TEXT NOT NULL,
  spoken_keyword TEXT,
  caption_line_1 TEXT NOT NULL,
  caption_body TEXT,
  hashtags_json TEXT NOT NULL DEFAULT '[]',
  invite_comment TEXT,
  script_json TEXT NOT NULL DEFAULT '[]',
  capcut_json TEXT NOT NULL DEFAULT '[]',
  descript_json TEXT NOT NULL DEFAULT '[]',
  camera_json TEXT NOT NULL DEFAULT '{}',
  sound_suggestion TEXT,
  dyno_safe BOOLEAN NOT NULL DEFAULT true,
  pillar TEXT NOT NULL,
  search_vs_trend TEXT NOT NULL,
  geo TEXT,
  assignee TEXT NOT NULL DEFAULT 'matt',
  soft_cta TEXT NOT NULL,
  estimated_seconds INTEGER,
  priority TEXT NOT NULL DEFAULT 'this_week',
  status TEXT NOT NULL DEFAULT 'open',
  growth_tags_json TEXT NOT NULL DEFAULT '[]',
  inspired_json TEXT NOT NULL DEFAULT '[]',
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE UNIQUE INDEX IF NOT EXISTS pulse_cards_report_key_idx ON pulse_recreate_cards (report_id, card_key);
CREATE INDEX IF NOT EXISTS pulse_cards_org_priority_idx ON pulse_recreate_cards (org_id, priority, status);
CREATE TABLE IF NOT EXISTS pulse_ideas (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  source_card_id TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  assignee TEXT NOT NULL DEFAULT 'matt',
  pillar TEXT NOT NULL DEFAULT 'other',
  search_vs_trend TEXT NOT NULL DEFAULT 'hybrid',
  dyno_safe BOOLEAN NOT NULL DEFAULT true,
  geo TEXT,
  soft_cta TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_ideas_org_status_idx ON pulse_ideas (org_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS pulse_ideas_card_idx ON pulse_ideas (org_id, report_id, source_card_id) WHERE source_card_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS pulse_audits (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  url TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  narrative TEXT,
  limitations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_audits_org_idx ON pulse_audits (org_id, created_at);
CREATE TABLE IF NOT EXISTS pulse_posting_windows (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  timezone TEXT NOT NULL,
  slots_json TEXT NOT NULL DEFAULT '[]',
  heatmap_json TEXT NOT NULL DEFAULT '{}',
  caveat TEXT NOT NULL,
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE UNIQUE INDEX IF NOT EXISTS pulse_windows_report_idx ON pulse_posting_windows (report_id);
CREATE TABLE IF NOT EXISTS pulse_exports (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  format TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'org'
);
CREATE INDEX IF NOT EXISTS pulse_exports_card_idx ON pulse_exports (card_id);`;

export const runPulseMigrations = runMigrations(
  [
    {
      version: 1,
      name: "pulse-content-tables",
      sql,
    },
  ],
  { table: "pulse_migrations" },
);
