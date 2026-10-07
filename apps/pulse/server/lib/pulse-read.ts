import { and, desc, eq } from "@agent-native/core/db/schema";

import { SEED_KEYWORDS } from "../../shared/pulse-guardrails.js";
import type { PulseRecreateCard } from "../../shared/pulse-schema.js";
import { getDb } from "../db/index.js";
import {
  pulseCompetitors,
  pulseKeywords,
  pulsePostingWindows,
  pulseRecreateCards,
  pulseReports,
  pulseTrends,
} from "../db/schema.js";

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toCard(row: typeof pulseRecreateCards.$inferSelect) {
  return {
    id: row.id,
    reportId: row.reportId,
    cardId: row.cardKey,
    title: row.title,
    hook: row.hook,
    onScreenText: row.onScreenText,
    spokenKeywordFirstSecond: row.spokenKeyword,
    captionLine1: row.captionLine1,
    captionBody: row.captionBody,
    hashtags: parseJson<string[]>(row.hashtagsJson, []),
    inviteKeywordComment: row.inviteComment,
    scriptBeats: parseJson<string[]>(row.scriptJson, []),
    capCutSceneOutline: parseJson<
      Array<{
        order: number;
        durationSec: number;
        visual: string;
        onScreen: string;
        vo?: string | null;
        brollSlot?: string | null;
        sfxOrSound?: string | null;
      }>
    >(row.capcutJson, []),
    descriptChapters: parseJson<
      Array<{ title: string; vo: string; broll?: string | null }>
    >(row.descriptJson, []),
    cameraNotes: parseJson(row.cameraJson, {}),
    soundSuggestion: row.soundSuggestion,
    dynoSafe: row.dynoSafe,
    pillar: row.pillar,
    searchVsTrend: row.searchVsTrend,
    geo: row.geo,
    assignee: row.assignee,
    softCta: row.softCta,
    estimatedSeconds: row.estimatedSeconds,
    priority: row.priority,
    status: row.status,
    growthPrincipleTags: parseJson<string[]>(row.growthTagsJson, []),
    inspiredBy: parseJson(row.inspiredJson, []),
  };
}

function asCamera(value: unknown): PulseRecreateCard["cameraNotes"] {
  if (
    value &&
    typeof value === "object" &&
    "primary" in value &&
    "notes" in value &&
    typeof (value as { notes: unknown }).notes === "string"
  ) {
    return value as PulseRecreateCard["cameraNotes"];
  }
  return {
    primary: "pocket4",
    notes: "Pocket 4 A-cam, Mic Mini, clap sync.",
  };
}

export function toPasteCard(
  card: ReturnType<typeof toCard>,
): PulseRecreateCard {
  const tags = card.growthPrincipleTags.filter(Boolean);
  return {
    cardId: card.cardId,
    title: card.title,
    hook: card.hook,
    onScreenText: card.onScreenText,
    spokenKeywordFirstSecond: card.spokenKeywordFirstSecond ?? undefined,
    captionLine1: card.captionLine1,
    captionBody: card.captionBody,
    hashtags: card.hashtags.length > 0 ? card.hashtags : ["#SwaffordSpeed"],
    inviteKeywordComment: card.inviteKeywordComment,
    scriptBeats: card.scriptBeats,
    capCutSceneOutline: card.capCutSceneOutline,
    descriptChapters: card.descriptChapters,
    cameraNotes: asCamera(card.cameraNotes),
    soundSuggestion: card.soundSuggestion,
    dynoSafe: card.dynoSafe,
    pillar: card.pillar as PulseRecreateCard["pillar"],
    searchVsTrend: card.searchVsTrend as PulseRecreateCard["searchVsTrend"],
    geo: (card.geo as PulseRecreateCard["geo"]) ?? undefined,
    assignee: card.assignee as PulseRecreateCard["assignee"],
    softCta: card.softCta,
    estimatedSeconds: card.estimatedSeconds ?? undefined,
    priority: card.priority as PulseRecreateCard["priority"],
    growthPrincipleTags: (tags.length > 0
      ? tags
      : ["dyno_safe"]) as PulseRecreateCard["growthPrincipleTags"],
    inspiredBy: card.inspiredBy as PulseRecreateCard["inspiredBy"],
  };
}

export async function latestReport(orgId: string) {
  const db = getDb();
  return (
    (
      await db
        .select({
          id: pulseReports.id,
          reportDate: pulseReports.reportDate,
          source: pulseReports.source,
          headline: pulseReports.headline,
          mattBlurb: pulseReports.mattBlurb,
          methodology: pulseReports.methodology,
          pdfDriveFileId: pulseReports.pdfDriveFileId,
          pdfDriveUrl: pulseReports.pdfDriveUrl,
          dataGapsJson: pulseReports.dataGapsJson,
          localNotes: pulseReports.localNotes,
          effectiveDynoUnlocked: pulseReports.effectiveDynoUnlocked,
          payloadDynoUnlocked: pulseReports.payloadDynoUnlocked,
          createdAt: pulseReports.createdAt,
        })
        .from(pulseReports)
        .where(eq(pulseReports.orgId, orgId))
        .orderBy(desc(pulseReports.reportDate), desc(pulseReports.createdAt))
        .limit(1)
    )[0] ?? null
  );
}

export async function cardsForReport(reportId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(pulseRecreateCards)
    .where(eq(pulseRecreateCards.reportId, reportId));
  return rows.map(toCard);
}

export async function windowsForReport(reportId: string, orgId: string) {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(pulsePostingWindows)
      .where(
        and(
          eq(pulsePostingWindows.reportId, reportId),
          eq(pulsePostingWindows.orgId, orgId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    timezone: row.timezone,
    recommendedSlots: parseJson(row.slotsJson, []),
    heatmapProxy: parseJson(row.heatmapJson, { days: [] }),
    caveat: row.caveat,
  };
}

export function mergeSeedKeywords(
  rows: Array<{
    id: string;
    term: string;
    intent: string;
    searchVsTrend: string;
    dynoSafe: boolean;
    pillar: string;
    geo: string | null;
    volumeProxy: string | null;
    competitionProxy: string | null;
    evergreen: boolean;
    seedLibrary: boolean;
    relatedJson: string;
    examplesJson: string;
    reportId: string | null;
  }>,
) {
  const seen = new Set(rows.map((row) => row.term.toLowerCase()));
  const stored = rows.map((row) => ({
    id: row.id,
    term: row.term,
    intent: row.intent,
    searchVsTrend: row.searchVsTrend,
    dynoSafe: row.dynoSafe,
    pillar: row.pillar,
    geo: row.geo,
    volumeProxy: row.volumeProxy,
    competitionProxy: row.competitionProxy,
    evergreen: row.evergreen,
    seedLibrary: row.seedLibrary,
    related: parseJson<string[]>(row.relatedJson, []),
    exampleVideos: parseJson(row.examplesJson, []),
    reportId: row.reportId,
    source: row.seedLibrary ? "seed" : "pulse",
  }));
  const seeds = SEED_KEYWORDS.filter(
    (seed) => !seen.has(seed.term.toLowerCase()),
  ).map((seed) => ({
    id: `seed:${seed.term}`,
    term: seed.term,
    intent: seed.intent,
    searchVsTrend: seed.searchVsTrend,
    dynoSafe: true,
    pillar: seed.pillar,
    geo: seed.geo,
    volumeProxy: seed.volumeProxy,
    competitionProxy: null as string | null,
    evergreen: true,
    seedLibrary: true,
    related: seed.related,
    exampleVideos: [],
    reportId: null as string | null,
    source: "seed" as const,
  }));
  return [...seeds, ...stored];
}

export async function listKeywords(orgId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(pulseKeywords)
    .where(eq(pulseKeywords.orgId, orgId))
    .orderBy(pulseKeywords.term);
  return mergeSeedKeywords(rows);
}

export async function listCompetitors(orgId: string, reportId: string | null) {
  if (!reportId) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(pulseCompetitors)
    .where(
      and(
        eq(pulseCompetitors.orgId, orgId),
        eq(pulseCompetitors.reportId, reportId),
      ),
    );
  return rows.map((row) => ({
    id: row.id,
    section: row.section,
    handle: row.handle,
    displayName: row.displayName,
    role: row.role,
    followers: row.followers,
    totalLikes: row.totalLikes,
    postsPerWeek: row.postsPerWeek,
    medianViews: row.medianViews,
    maxViews: row.maxViews,
    followerLikeHealthPct: row.followerLikeHealthPct,
    geo: row.geo,
    notes: row.notes,
    hookPatterns: parseJson<string[]>(row.hookPatternsJson, []),
    ctaPatterns: parseJson<string[]>(row.ctaPatternsJson, []),
    sample: parseJson(row.sampleJson, null),
    topVideos: parseJson<
      Array<{
        caption?: string | null;
        views?: number | null;
        likes?: number | null;
        url?: string;
      }>
    >(row.topVideosJson, []),
  }));
}

export async function listTrends(orgId: string, reportId: string | null) {
  if (!reportId) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(pulseTrends)
    .where(
      and(eq(pulseTrends.orgId, orgId), eq(pulseTrends.reportId, reportId)),
    );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    classification: row.classification,
    halfLifeDays: row.halfLifeDays,
    searchVsTrend: row.searchVsTrend,
    dynoSafe: row.dynoSafe,
    pillar: row.pillar,
    geo: row.geo,
    whyNow: row.whyNow,
    exampleVideos: parseJson(row.examplesJson, []),
  }));
}
