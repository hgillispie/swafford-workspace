import {
  boolean,
  index,
  integer,
  now,
  ownableColumns,
  real,
  table,
  text,
  uniqueIndex,
} from "@agent-native/core/db/schema";

export const pulseSettings = table(
  "pulse_settings",
  {
    id: text("id").primaryKey(),
    dynoUnlocked: boolean("dyno_unlocked").notNull().default(false),
    updatedAt: text("updated_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("pulse_settings_org_idx").on(t.orgId)],
);

export const pulseReports = table(
  "pulse_reports",
  {
    id: text("id").primaryKey(),
    reportDate: text("report_date").notNull(),
    source: text("source").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    schemaVersion: text("schema_version").notNull(),
    generatedAt: text("generated_at").notNull(),
    timezone: text("timezone").notNull(),
    headline: text("headline").notNull(),
    mattBlurb: text("matt_blurb").notNull(),
    hunterNotes: text("hunter_notes").notNull(),
    windowDays: integer("window_days"),
    pdfDriveFileId: text("pdf_drive_file_id"),
    pdfDriveUrl: text("pdf_drive_url"),
    xlsxDriveFileId: text("xlsx_drive_file_id"),
    methodology: text("methodology"),
    brandJson: text("brand_json").notNull(),
    payloadJson: text("payload_json").notNull(),
    dataGapsJson: text("data_gaps_json").notNull().default("[]"),
    growthTagsJson: text("growth_tags_json").notNull().default("[]"),
    localNotes: text("local_notes"),
    payloadDynoUnlocked: boolean("payload_dyno_unlocked").notNull().default(false),
    effectiveDynoUnlocked: boolean("effective_dyno_unlocked")
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [
    uniqueIndex("pulse_reports_idem_idx").on(t.orgId, t.idempotencyKey),
    uniqueIndex("pulse_reports_date_source_idx").on(
      t.orgId,
      t.reportDate,
      t.source,
    ),
    index("pulse_reports_org_date_idx").on(t.orgId, t.reportDate),
  ],
);

export const pulseIngestRuns = table(
  "pulse_ingest_runs",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id"),
    idempotencyKey: text("idempotency_key"),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    schemaVersion: text("schema_version"),
    receivedAt: text("received_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("pulse_ingest_runs_org_idx").on(t.orgId, t.receivedAt)],
);

export const pulseTrends = table(
  "pulse_trends",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    classification: text("classification").notNull(),
    halfLifeDays: real("half_life_days"),
    searchVsTrend: text("search_vs_trend").notNull(),
    dynoSafe: boolean("dyno_safe").notNull().default(true),
    pillar: text("pillar"),
    geo: text("geo"),
    whyNow: text("why_now"),
    examplesJson: text("examples_json").notNull().default("[]"),
    ...ownableColumns(),
  },
  (t) => [index("pulse_trends_report_idx").on(t.reportId)],
);

export const pulseKeywords = table(
  "pulse_keywords",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id"),
    term: text("term").notNull(),
    intent: text("intent").notNull(),
    searchVsTrend: text("search_vs_trend").notNull(),
    dynoSafe: boolean("dyno_safe").notNull().default(true),
    pillar: text("pillar").notNull(),
    geo: text("geo"),
    volumeProxy: text("volume_proxy"),
    competitionProxy: text("competition_proxy"),
    evergreen: boolean("evergreen").notNull().default(true),
    seedLibrary: boolean("seed_library").notNull().default(false),
    relatedJson: text("related_json").notNull().default("[]"),
    examplesJson: text("examples_json").notNull().default("[]"),
    ...ownableColumns(),
  },
  (t) => [
    index("pulse_keywords_org_idx").on(t.orgId, t.term),
    index("pulse_keywords_report_idx").on(t.reportId),
  ],
);

export const pulseCompetitors = table(
  "pulse_competitors",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    section: text("section").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    role: text("role").notNull(),
    followers: integer("followers"),
    totalLikes: integer("total_likes"),
    postsPerWeek: real("posts_per_week"),
    medianViews: real("median_views"),
    maxViews: integer("max_views"),
    followerLikeHealthPct: real("follower_like_health_pct"),
    geo: text("geo"),
    notes: text("notes"),
    hookPatternsJson: text("hook_patterns_json").notNull().default("[]"),
    ctaPatternsJson: text("cta_patterns_json").notNull().default("[]"),
    sampleJson: text("sample_json").notNull().default("{}"),
    topVideosJson: text("top_videos_json").notNull().default("[]"),
    snapshotJson: text("snapshot_json").notNull().default("{}"),
    ...ownableColumns(),
  },
  (t) => [index("pulse_competitors_report_idx").on(t.reportId, t.section)],
);

export const pulseVideos = table(
  "pulse_videos",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(),
    platformVideoId: text("platform_video_id"),
    url: text("url").notNull(),
    handle: text("handle").notNull(),
    caption: text("caption"),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
    durationSec: integer("duration_sec"),
    soundName: text("sound_name"),
    outlierScore: real("outlier_score"),
    searchVsTrend: text("search_vs_trend"),
    geo: text("geo"),
    dynoSafe: boolean("dyno_safe").notNull().default(true),
    payloadJson: text("payload_json").notNull().default("{}"),
    ...ownableColumns(),
  },
  (t) => [index("pulse_videos_org_url_idx").on(t.orgId, t.url)],
);

export const pulseRecreateCards = table(
  "pulse_recreate_cards",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    cardKey: text("card_key").notNull(),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    onScreenText: text("on_screen_text").notNull(),
    spokenKeyword: text("spoken_keyword"),
    captionLine1: text("caption_line_1").notNull(),
    captionBody: text("caption_body"),
    hashtagsJson: text("hashtags_json").notNull().default("[]"),
    inviteComment: text("invite_comment"),
    scriptJson: text("script_json").notNull().default("[]"),
    capcutJson: text("capcut_json").notNull().default("[]"),
    descriptJson: text("descript_json").notNull().default("[]"),
    cameraJson: text("camera_json").notNull().default("{}"),
    soundSuggestion: text("sound_suggestion"),
    dynoSafe: boolean("dyno_safe").notNull().default(true),
    pillar: text("pillar").notNull(),
    searchVsTrend: text("search_vs_trend").notNull(),
    geo: text("geo"),
    assignee: text("assignee").notNull().default("matt"),
    softCta: text("soft_cta").notNull(),
    estimatedSeconds: integer("estimated_seconds"),
    priority: text("priority").notNull().default("this_week"),
    status: text("status").notNull().default("open"),
    growthTagsJson: text("growth_tags_json").notNull().default("[]"),
    inspiredJson: text("inspired_json").notNull().default("[]"),
    ...ownableColumns(),
  },
  (t) => [
    uniqueIndex("pulse_cards_report_key_idx").on(t.reportId, t.cardKey),
    index("pulse_cards_org_priority_idx").on(t.orgId, t.priority, t.status),
  ],
);

export const pulseIdeas = table(
  "pulse_ideas",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id"),
    sourceCardId: text("source_card_id"),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("idea"),
    assignee: text("assignee").notNull().default("matt"),
    pillar: text("pillar").notNull().default("other"),
    searchVsTrend: text("search_vs_trend").notNull().default("hybrid"),
    dynoSafe: boolean("dyno_safe").notNull().default(true),
    geo: text("geo"),
    softCta: text("soft_cta"),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("pulse_ideas_org_status_idx").on(t.orgId, t.status)],
);

export const pulseAudits = table(
  "pulse_audits",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull(),
    url: text("url"),
    summaryJson: text("summary_json").notNull().default("{}"),
    narrative: text("narrative"),
    limitationsJson: text("limitations_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("pulse_audits_org_idx").on(t.orgId, t.createdAt)],
);

export const pulsePostingWindows = table(
  "pulse_posting_windows",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id").notNull(),
    timezone: text("timezone").notNull(),
    slotsJson: text("slots_json").notNull().default("[]"),
    heatmapJson: text("heatmap_json").notNull().default("{}"),
    caveat: text("caveat").notNull(),
    ...ownableColumns(),
  },
  (t) => [uniqueIndex("pulse_windows_report_idx").on(t.reportId)],
);

export const pulseExports = table(
  "pulse_exports",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id").notNull(),
    format: text("format").notNull(),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("pulse_exports_card_idx").on(t.cardId)],
);
