import {
  boolean,
  index,
  now,
  ownableColumns,
  table,
  text,
  uniqueIndex,
} from "@agent-native/core/db/schema";

export const scoutSettings = table(
  "scout_settings",
  {
    id: text("id").primaryKey(),
    brandJson: text("brand_json").notNull().default("{}"),
    dynoUnlocked: boolean("dyno_unlocked").notNull().default(false),
    updatedAt: text("updated_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("scout_settings_org_idx").on(t.orgId)],
);

export const scoutCache = table(
  "scout_cache",
  {
    id: text("id").primaryKey(),
    cacheKey: text("cache_key").notNull(),
    kind: text("kind").notNull(),
    query: text("query").notNull(),
    payloadJson: text("payload_json").notNull(),
    cursor: text("cursor"),
    fetchedAt: text("fetched_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    ...ownableColumns(),
  },
  (t) => [
    uniqueIndex("scout_cache_org_key_idx").on(t.orgId, t.cacheKey),
    index("scout_cache_org_kind_idx").on(t.orgId, t.kind),
  ],
);

export const scoutCompetitors = table(
  "scout_competitors",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    role: text("role").notNull().default("watch"),
    notes: text("notes"),
    snapshotJson: text("snapshot_json").notNull().default("{}"),
    updatedAt: text("updated_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [uniqueIndex("scout_competitors_org_handle_idx").on(t.orgId, t.handle)],
);

export const scoutAudits = table(
  "scout_audits",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull(),
    summaryJson: text("summary_json").notNull().default("{}"),
    narrative: text("narrative"),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("scout_audits_org_idx").on(t.orgId, t.createdAt)],
);

export const scoutReports = table(
  "scout_reports",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    packetJson: text("packet_json").notNull(),
    narrative: text("narrative"),
    status: text("status").notNull().default("packet"),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("scout_reports_org_kind_idx").on(t.orgId, t.kind, t.createdAt)],
);

export const scoutRecreates = table(
  "scout_recreates",
  {
    id: text("id").primaryKey(),
    sourceVideoId: text("source_video_id"),
    sourceHandle: text("source_handle"),
    sourceUrl: text("source_url"),
    cardJson: text("card_json").notNull(),
    pasteJson: text("paste_json").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("scout_recreates_org_idx").on(t.orgId, t.createdAt)],
);

export const scoutDrafts = table(
  "scout_drafts",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    topic: text("topic").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull().default(now()),
    ...ownableColumns(),
  },
  (t) => [index("scout_drafts_org_idx").on(t.orgId, t.createdAt)],
);
