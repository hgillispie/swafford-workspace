import { z } from "zod";

const geoSchema = z
  .enum(["upstate_sc", "wnc", "east_tn", "national"])
  .nullable();
const searchVsTrendSchema = z.enum(["search", "trend", "hybrid"]);
const pillarSchema = z.enum([
  "performance_build",
  "electrical_diagnosis",
  "older_harley_repair",
  "bagger_exhaust",
  "sportster_chopper",
  "road_glide_dyna",
  "shop_culture",
  "local_geo",
  "customer_outcome",
  "tool_tip",
  "other",
]);
const growthTagSchema = z.enum([
  "mix_50_50_trend_search",
  "metadata_stack",
  "edit_cadence_3_5s",
  "outcome_cta",
  "best_time_windows",
  "follower_health_15pct",
  "first_hour_replies",
  "keyword_in_first_second",
  "local_geo_tags",
  "dyno_safe",
]);
const volumeSchema = z
  .enum(["very_high", "high", "medium", "low", "unknown"])
  .nullable();

export const videoRefSchema = z
  .object({
    platform: z.enum(["tiktok", "youtube"]),
    platformVideoId: z.string().nullable().optional(),
    url: z.string().url(),
    handle: z.string().min(1),
    caption: z.string().nullable().optional(),
    postedAt: z.iso.datetime({ offset: true }).nullable().optional(),
    views: z.number().int().min(0).nullable().optional(),
    likes: z.number().int().min(0).nullable().optional(),
    comments: z.number().int().min(0).nullable().optional(),
    durationSec: z.number().int().min(0).nullable().optional(),
    soundName: z.string().nullable().optional(),
    outlierScore: z.number().nullable().optional(),
    searchVsTrend: searchVsTrendSchema.optional(),
    geo: geoSchema.optional(),
    dynoSafe: z.boolean().optional(),
  })
  .strict();

const sampleSchema = z
  .object({
    n: z.number().int().min(0),
    dateRange: z.string().nullable().optional(),
    method: z.enum([
      "public_grid",
      "yt_dlp",
      "research_api",
      "commercial_api",
      "manual",
      "mixed",
    ]),
  })
  .strict();

export const competitorSnapshotSchema = z
  .object({
    handle: z.string().min(1),
    displayName: z.string().nullable().optional(),
    role: z.enum([
      "north_star",
      "performer",
      "up_and_comer",
      "local",
      "regional",
      "format_reference",
      "own_account",
    ]),
    followers: z.number().int().min(0).nullable(),
    followersPrev: z.number().int().min(0).nullable().optional(),
    totalLikes: z.number().int().min(0).nullable().optional(),
    videoCount: z.number().int().min(0).nullable().optional(),
    postsPerWeek: z.number().min(0).nullable().optional(),
    medianViews: z.number().min(0).nullable().optional(),
    maxViews: z.number().int().min(0).nullable().optional(),
    daysSinceLastPost: z.number().int().min(0).nullable().optional(),
    followerLikeHealthPct: z.number().min(0).nullable().optional(),
    geo: geoSchema.optional(),
    hookPatterns: z.array(z.string()).optional(),
    ctaPatterns: z.array(z.string()).optional(),
    soundNotes: z.string().nullable().optional(),
    sample: sampleSchema,
    topVideos: z.array(videoRefSchema).max(10).optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const keywordItemSchema = z
  .object({
    term: z.string().min(1),
    related: z.array(z.string()).optional(),
    volumeProxy: volumeSchema.optional(),
    competitionProxy: volumeSchema.optional(),
    intent: z.enum([
      "informational",
      "how_to",
      "local_shop",
      "product",
      "entertainment",
      "mixed",
    ]),
    searchVsTrend: searchVsTrendSchema,
    geo: geoSchema.optional(),
    dynoSafe: z.boolean(),
    pillar: pillarSchema,
    evergreen: z.boolean().optional(),
    exampleVideos: z.array(videoRefSchema).max(5).optional(),
    seedLibrary: z.boolean().optional(),
  })
  .strict();

export const trendItemSchema = z
  .object({
    label: z.string().min(1),
    classification: z.enum([
      "mega_trend",
      "flash_24_72h",
      "format",
      "sound",
      "topic",
    ]),
    halfLifeDays: z.number().min(0).nullable().optional(),
    searchVsTrend: searchVsTrendSchema,
    geo: geoSchema.optional(),
    dynoSafe: z.boolean(),
    pillar: pillarSchema.optional(),
    exampleVideos: z.array(videoRefSchema).max(5).optional(),
    whyNow: z.string().nullable().optional(),
  })
  .strict();

const cameraNotesSchema = z
  .object({
    primary: z.enum(["pocket4", "osmo360", "both", "phone_backup"]),
    pocket4: z.string().nullable().optional(),
    osmo360: z.string().nullable().optional(),
    micMini: z.string().nullable().optional(),
    clapSync: z.boolean().optional(),
    notes: z.string(),
  })
  .strict();

const capCutSceneSchema = z
  .object({
    order: z.number().int().min(1),
    durationSec: z.number().min(1).max(12),
    visual: z.string(),
    onScreen: z.string(),
    vo: z.string().nullable().optional(),
    brollSlot: z.string().nullable().optional(),
    sfxOrSound: z.string().nullable().optional(),
  })
  .strict();

export const recreateCardSchema = z
  .object({
    cardId: z.string().min(1),
    title: z.string().max(80),
    inspiredBy: z.array(videoRefSchema).max(5).optional(),
    hook: z.string().min(1),
    onScreenText: z.string(),
    spokenKeywordFirstSecond: z.string().optional(),
    captionLine1: z.string(),
    captionBody: z.string().nullable().optional(),
    hashtags: z
      .array(z.string().regex(/^#?[A-Za-z0-9_]+$/))
      .min(3)
      .max(8),
    inviteKeywordComment: z.string().nullable().optional(),
    scriptBeats: z.array(z.string()).optional(),
    capCutSceneOutline: z.array(capCutSceneSchema).min(3).max(12),
    descriptChapters: z
      .array(
        z
          .object({
            title: z.string(),
            vo: z.string(),
            broll: z.string().nullable().optional(),
          })
          .strict(),
      )
      .optional(),
    cameraNotes: cameraNotesSchema,
    soundSuggestion: z.string().nullable().optional(),
    dynoSafe: z.boolean(),
    pillar: pillarSchema,
    searchVsTrend: searchVsTrendSchema,
    geo: geoSchema.optional(),
    assignee: z.enum(["matt", "hunter", "either"]).optional(),
    softCta: z.string(),
    estimatedSeconds: z.number().int().min(15).max(90).optional(),
    priority: z.enum(["this_week", "next_window", "backlog"]).optional(),
    growthPrincipleTags: z.array(growthTagSchema).min(1),
  })
  .strict();

const slotSchema = z
  .object({
    dayOfWeek: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    localTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
    reason: z.string(),
    source: z
      .enum(["competitor_heatmap", "own_analytics", "niche_proxy", "manual"])
      .optional(),
  })
  .strict();

export const pulseIngestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    reportDate: z.iso.date(),
    source: z.enum(["tiktok", "youtube"]),
    generatedAt: z.iso.datetime({ offset: true }),
    timezone: z.literal("America/New_York"),
    idempotencyKey: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}:(tiktok|youtube)$/)
      .optional(),
    brand: z
      .object({
        name: z.literal("Swafford Speed"),
        handle: z.string().optional(),
        geo: z
          .array(z.enum(["upstate_sc", "wnc", "east_tn", "national"]))
          .min(1),
        dynoUnlocked: z.boolean(),
        softCtaPresets: z.array(z.string()).optional(),
      })
      .strict(),
    summary: z
      .object({
        headline: z.string().max(160),
        mattBlurb: z.string().max(480),
        hunterNotes: z.string(),
        windowDays: z.number().int().min(1).max(30).optional(),
        pdfDriveFileId: z.string().nullable().optional(),
        pdfDriveUrl: z.string().url().nullable().optional(),
        xlsxDriveFileId: z.string().nullable().optional(),
        methodology: z.string().optional(),
      })
      .strict(),
    performers: z.array(competitorSnapshotSchema),
    upAndComers: z.array(competitorSnapshotSchema),
    aheadOfCurve: z.array(trendItemSchema),
    localGeo: z
      .object({
        upstateSc: z.array(competitorSnapshotSchema),
        wnc: z.array(competitorSnapshotSchema),
        notes: z.string(),
      })
      .strict(),
    keywords: z.array(keywordItemSchema),
    trendingTerms: z.array(trendItemSchema),
    competitors: z.array(competitorSnapshotSchema),
    videos: z.array(videoRefSchema).optional(),
    recreateCards: z.array(recreateCardSchema).min(2).max(12),
    postingWindows: z
      .object({
        timezone: z.literal("America/New_York"),
        recommendedSlots: z.array(slotSchema),
        heatmapProxy: z
          .object({
            days: z
              .array(
                z.array(z.number().min(0).max(1).nullable()).length(24),
              )
              .length(7),
            basis: z.string().optional(),
          })
          .strict(),
        caveat: z.string(),
      })
      .strict(),
    dataGaps: z.array(
      z
        .object({
          code: z.enum([
            "private_account",
            "user_not_found",
            "views_unavailable",
            "rate_limited",
            "tos_block",
            "api_missing",
            "geo_thin",
            "dyno_locked",
            "other",
          ]),
          message: z.string(),
          severity: z.enum(["low", "medium", "high"]),
          affectedHandles: z.array(z.string()).optional(),
        })
        .strict(),
    ),
    growthPrincipleTags: z.array(growthTagSchema).min(1),
    exportsHints: z
      .object({
        defaultStack: z.literal("dji_studio_descript_capcut").optional(),
        opusOptional: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const expected = `${payload.reportDate}:${payload.source}`;
    if (payload.idempotencyKey && payload.idempotencyKey !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["idempotencyKey"],
        message: `idempotencyKey must be ${expected}`,
      });
    }
  });

export type PulseIngest = z.infer<typeof pulseIngestSchema>;
export type PulseRecreateCard = z.infer<typeof recreateCardSchema>;
export type PulseVideoRef = z.infer<typeof videoRefSchema>;
export type PulseCompetitor = z.infer<typeof competitorSnapshotSchema>;

export function parsePulseIngest(input: unknown): PulseIngest {
  return pulseIngestSchema.parse(input);
}

export function idempotencyKeyFor(payload: PulseIngest): string {
  return payload.idempotencyKey ?? `${payload.reportDate}:${payload.source}`;
}
