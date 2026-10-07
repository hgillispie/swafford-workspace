import { randomUUID } from "node:crypto";

import { and, eq } from "@agent-native/core/db/schema";

import { getDb } from "../db/index.js";
import {
  pulseCompetitors,
  pulseIdeas,
  pulseIngestRuns,
  pulseKeywords,
  pulsePostingWindows,
  pulseRecreateCards,
  pulseReports,
  pulseTrends,
  pulseVideos,
} from "../db/schema.js";
import { enforceIngest } from "../../shared/pulse-guardrails.js";
import {
  type PulseCompetitor,
  type PulseIngest,
  type PulseVideoRef,
  idempotencyKeyFor,
} from "../../shared/pulse-schema.js";
import { readDynoUnlocked } from "./pulse-access.js";

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function ownable(orgId: string, email: string) {
  return {
    ownerEmail: email,
    orgId,
    visibility: "org" as const,
  };
}

function videoId(orgId: string, video: PulseVideoRef): string {
  const platformId = video.platformVideoId?.trim();
  if (platformId) return `${orgId}:${video.platform}:${platformId}`;
  return `${orgId}:url:${video.url}`;
}

async function upsertVideo(
  tx: ReturnType<typeof getDb>,
  orgId: string,
  email: string,
  video: PulseVideoRef,
) {
  const id = videoId(orgId, video);
  const values = {
    id,
    platform: video.platform,
    platformVideoId: video.platformVideoId ?? null,
    url: video.url,
    handle: video.handle.replace(/^@/, ""),
    caption: video.caption ?? null,
    views: video.views ?? null,
    likes: video.likes ?? null,
    comments: video.comments ?? null,
    durationSec: video.durationSec ?? null,
    soundName: video.soundName ?? null,
    outlierScore: video.outlierScore ?? null,
    searchVsTrend: video.searchVsTrend ?? null,
    geo: video.geo ?? null,
    dynoSafe: video.dynoSafe !== false,
    payloadJson: json(video),
    ...ownable(orgId, email),
  };
  const existing = (
    await tx
      .select({ id: pulseVideos.id })
      .from(pulseVideos)
      .where(and(eq(pulseVideos.id, id), eq(pulseVideos.orgId, orgId)))
      .limit(1)
  )[0];
  if (existing) {
    await tx
      .update(pulseVideos)
      .set(values)
      .where(and(eq(pulseVideos.id, id), eq(pulseVideos.orgId, orgId)));
  } else {
    await tx.insert(pulseVideos).values(values);
  }
}

function competitorValues(
  orgId: string,
  email: string,
  reportId: string,
  section: string,
  snapshot: PulseCompetitor,
) {
  return {
    id: `${reportId}:${section}:${snapshot.handle.toLowerCase()}`,
    reportId,
    section,
    handle: snapshot.handle.replace(/^@/, ""),
    displayName: snapshot.displayName ?? null,
    role: snapshot.role,
    followers: snapshot.followers,
    totalLikes: snapshot.totalLikes ?? null,
    postsPerWeek: snapshot.postsPerWeek ?? null,
    medianViews: snapshot.medianViews ?? null,
    maxViews: snapshot.maxViews ?? null,
    followerLikeHealthPct: snapshot.followerLikeHealthPct ?? null,
    geo: snapshot.geo ?? null,
    notes: snapshot.notes ?? null,
    hookPatternsJson: json(snapshot.hookPatterns ?? []),
    ctaPatternsJson: json(snapshot.ctaPatterns ?? []),
    sampleJson: json(snapshot.sample),
    topVideosJson: json(snapshot.topVideos ?? []),
    snapshotJson: json(snapshot),
    ...ownable(orgId, email),
  };
}

export async function upsertPulseReport(input: {
  payload: PulseIngest;
  orgId: string;
  actorEmail: string;
}): Promise<{
  id: string;
  idempotencyKey: string;
  reportDate: string;
  source: string;
  replaced: boolean;
  cardCount: number;
  effectiveDynoUnlocked: boolean;
}> {
  const orgId = input.orgId;
  const email = input.actorEmail || "pulse-ingest@example.com";
  const adminUnlocked = await readDynoUnlocked(orgId);
  const payload = enforceIngest(input.payload, adminUnlocked);
  const key = idempotencyKeyFor(payload);
  const db = getDb();

  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select({ id: pulseReports.id })
        .from(pulseReports)
        .where(
          and(
            eq(pulseReports.orgId, orgId),
            eq(pulseReports.idempotencyKey, key),
          ),
        )
        .limit(1)
    )[0];
    const reportId = existing?.id ?? randomUUID();
    const replaced = Boolean(existing);
    const reportValues = {
      id: reportId,
      reportDate: payload.reportDate,
      source: payload.source,
      idempotencyKey: key,
      schemaVersion: payload.schemaVersion,
      generatedAt: payload.generatedAt,
      timezone: payload.timezone,
      headline: payload.summary.headline,
      mattBlurb: payload.summary.mattBlurb,
      hunterNotes: payload.summary.hunterNotes,
      windowDays: payload.summary.windowDays ?? 14,
      pdfDriveFileId: payload.summary.pdfDriveFileId ?? null,
      pdfDriveUrl: payload.summary.pdfDriveUrl ?? null,
      xlsxDriveFileId: payload.summary.xlsxDriveFileId ?? null,
      methodology: payload.summary.methodology ?? null,
      brandJson: json(payload.brand),
      payloadJson: json(input.payload),
      dataGapsJson: json(payload.dataGaps),
      growthTagsJson: json(payload.growthPrincipleTags),
      localNotes: payload.localGeo.notes,
      payloadDynoUnlocked: input.payload.brand.dynoUnlocked,
      effectiveDynoUnlocked: adminUnlocked,
      ...ownable(orgId, email),
    };
    if (existing) {
      await tx
        .update(pulseReports)
        .set(reportValues)
        .where(eq(pulseReports.id, reportId));
    } else {
      await tx.insert(pulseReports).values(reportValues);
    }

    await tx.delete(pulseTrends).where(eq(pulseTrends.reportId, reportId));
    await tx.delete(pulseKeywords).where(eq(pulseKeywords.reportId, reportId));
    await tx
      .delete(pulseCompetitors)
      .where(eq(pulseCompetitors.reportId, reportId));
    await tx
      .delete(pulsePostingWindows)
      .where(eq(pulsePostingWindows.reportId, reportId));

    const previousCards = await tx
      .select({
        cardKey: pulseRecreateCards.cardKey,
        status: pulseRecreateCards.status,
      })
      .from(pulseRecreateCards)
      .where(eq(pulseRecreateCards.reportId, reportId));
    const statusByKey = new Map(
      previousCards.map((row) => [row.cardKey, row.status]),
    );
    await tx
      .delete(pulseRecreateCards)
      .where(eq(pulseRecreateCards.reportId, reportId));

    const trendRows = [
      ...payload.aheadOfCurve.map((item) => ({ item, kind: "ahead_of_curve" })),
      ...payload.trendingTerms.map((item) => ({ item, kind: "trending_term" })),
    ];
    if (trendRows.length > 0) {
      await tx.insert(pulseTrends).values(
        trendRows.map(({ item, kind }, index) => ({
          id: `${reportId}:${kind}:${index}`,
          reportId,
          kind,
          label: item.label,
          classification: item.classification,
          halfLifeDays: item.halfLifeDays ?? null,
          searchVsTrend: item.searchVsTrend,
          dynoSafe: item.dynoSafe,
          pillar: item.pillar ?? null,
          geo: item.geo ?? null,
          whyNow: item.whyNow ?? null,
          examplesJson: json(item.exampleVideos ?? []),
          ...ownable(orgId, email),
        })),
      );
    }

    if (payload.keywords.length > 0) {
      await tx.insert(pulseKeywords).values(
        payload.keywords.map((keyword, index) => ({
          id: `${reportId}:keyword:${index}`,
          reportId,
          term: keyword.term,
          intent: keyword.intent,
          searchVsTrend: keyword.searchVsTrend,
          dynoSafe: keyword.dynoSafe,
          pillar: keyword.pillar,
          geo: keyword.geo ?? null,
          volumeProxy: keyword.volumeProxy ?? null,
          competitionProxy: keyword.competitionProxy ?? null,
          evergreen: keyword.evergreen !== false,
          seedLibrary: keyword.seedLibrary === true,
          relatedJson: json(keyword.related ?? []),
          examplesJson: json(keyword.exampleVideos ?? []),
          ...ownable(orgId, email),
        })),
      );
    }

    const competitorSections: Array<[string, PulseCompetitor[]]> = [
      ["performer", payload.performers],
      ["up_and_comer", payload.upAndComers],
      ["competitor", payload.competitors],
      ["local_upstate_sc", payload.localGeo.upstateSc],
      ["local_wnc", payload.localGeo.wnc],
    ];
    const competitorRows = competitorSections.flatMap(([section, rows]) =>
      rows.map((snapshot) =>
        competitorValues(orgId, email, reportId, section, snapshot),
      ),
    );
    if (competitorRows.length > 0) {
      await tx.insert(pulseCompetitors).values(competitorRows);
    }

    const videos: PulseVideoRef[] = [
      ...(payload.videos ?? []),
      ...payload.performers.flatMap((row) => row.topVideos ?? []),
      ...payload.upAndComers.flatMap((row) => row.topVideos ?? []),
      ...payload.competitors.flatMap((row) => row.topVideos ?? []),
      ...payload.keywords.flatMap((row) => row.exampleVideos ?? []),
      ...payload.trendingTerms.flatMap((row) => row.exampleVideos ?? []),
      ...payload.aheadOfCurve.flatMap((row) => row.exampleVideos ?? []),
      ...payload.recreateCards.flatMap((row) => row.inspiredBy ?? []),
    ];
    const seen = new Set<string>();
    for (const video of videos) {
      const id = videoId(orgId, video);
      if (seen.has(id)) continue;
      seen.add(id);
      await upsertVideo(tx, orgId, email, video);
    }

    const cardRows = payload.recreateCards.map((card) => ({
      id: `${reportId}:${card.cardId}`,
      reportId,
      cardKey: card.cardId,
      title: card.title,
      hook: card.hook,
      onScreenText: card.onScreenText,
      spokenKeyword: card.spokenKeywordFirstSecond ?? null,
      captionLine1: card.captionLine1,
      captionBody: card.captionBody ?? null,
      hashtagsJson: json(card.hashtags),
      inviteComment: card.inviteKeywordComment ?? null,
      scriptJson: json(card.scriptBeats ?? []),
      capcutJson: json(card.capCutSceneOutline),
      descriptJson: json(card.descriptChapters ?? []),
      cameraJson: json(card.cameraNotes),
      soundSuggestion: card.soundSuggestion ?? null,
      dynoSafe: card.dynoSafe,
      pillar: card.pillar,
      searchVsTrend: card.searchVsTrend,
      geo: card.geo ?? null,
      assignee: card.assignee ?? "matt",
      softCta: card.softCta,
      estimatedSeconds: card.estimatedSeconds ?? null,
      priority: card.priority ?? "this_week",
      status: statusByKey.get(card.cardId) ?? "open",
      growthTagsJson: json(card.growthPrincipleTags),
      inspiredJson: json(card.inspiredBy ?? []),
      ...ownable(orgId, email),
    }));
    if (cardRows.length > 0) {
      await tx.insert(pulseRecreateCards).values(cardRows);
    }

    const existingIdeas = await tx
      .select()
      .from(pulseIdeas)
      .where(eq(pulseIdeas.reportId, reportId));
    const incoming = new Set(payload.recreateCards.map((card) => card.cardId));
    for (const idea of existingIdeas) {
      if (
        idea.sourceCardId &&
        !incoming.has(idea.sourceCardId) &&
        idea.status === "idea"
      ) {
        await tx.delete(pulseIdeas).where(eq(pulseIdeas.id, idea.id));
      }
    }
    for (const card of payload.recreateCards) {
      const ideaId = `${reportId}:idea:${card.cardId}`;
      const previous = existingIdeas.find((idea) => idea.id === ideaId);
      const values = {
        id: ideaId,
        reportId,
        sourceCardId: card.cardId,
        title: card.title,
        notes: card.hook,
        status: previous?.status ?? "idea",
        assignee: card.assignee === "hunter" ? "hunter" : "matt",
        pillar: card.pillar,
        searchVsTrend: card.searchVsTrend,
        dynoSafe: card.dynoSafe,
        geo: card.geo ?? null,
        softCta: card.softCta,
        ...ownable(orgId, email),
      };
      if (previous) {
        await tx.update(pulseIdeas).set(values).where(eq(pulseIdeas.id, ideaId));
      } else {
        await tx.insert(pulseIdeas).values(values);
      }
    }

    await tx.insert(pulsePostingWindows).values({
      id: `${reportId}:windows`,
      reportId,
      timezone: payload.postingWindows.timezone,
      slotsJson: json(payload.postingWindows.recommendedSlots),
      heatmapJson: json(payload.postingWindows.heatmapProxy),
      caveat: payload.postingWindows.caveat,
      ...ownable(orgId, email),
    });

    await tx.insert(pulseIngestRuns).values({
      id: randomUUID(),
      reportId,
      idempotencyKey: key,
      status: "ok",
      schemaVersion: payload.schemaVersion,
      ...ownable(orgId, email),
    });

    return {
      id: reportId,
      idempotencyKey: key,
      reportDate: payload.reportDate,
      source: payload.source,
      replaced,
      cardCount: cardRows.length,
      effectiveDynoUnlocked: adminUnlocked,
    };
  });
}
