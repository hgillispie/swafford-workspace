import { fail, isActionContractError } from "@agent-native/core/action";

import type { Actor } from "./access.js";
import { readBrand, readScrapeKey } from "./access.js";
import {
  fetchProfile,
  fetchProfileVideos,
  fetchTrending,
  searchHashtag,
  searchKeyword,
} from "./scrapecreators.js";
import {
  insertAudit,
  insertDraft,
  insertRecreate,
  insertReport,
  latestReport,
  listAudits,
  listCompetitors,
  listDrafts,
  listRecreates,
  parseJson,
  readCache,
  readPulseEnrichment,
  readRecreate,
  rememberIntelligenceMisses,
  saveAuditNarrative,
  saveReportNarrative,
  sendPulseIdea,
  updateDraft,
  updateRecreate,
  upsertCompetitor,
  writeCache,
} from "./store.js";
import { keepHit, type BoardFilters } from "../../shared/board.js";
import type { BrandConfig, SearchVsTrend } from "../../shared/brand.js";
import {
  buildPastePack,
  draftBody,
  enforceCard,
  followerLikeHealth,
  hasEmptyFollowCta,
  scrubCopy,
  skeletonRecreate,
  type RecreateCard,
} from "../../shared/guardrails.js";
import {
  classifyTerm,
  competitorCaptionTerms,
  ctaPatterns,
  extractProfile,
  extractVideos,
  hookPatterns,
  inferIntent,
  markOutliers,
  postingHeatmap,
  relatedTerms,
  volumeProxy,
  withinDays,
  type ScoutProfile,
  type ScoutVideo,
  type TrendTerm,
} from "../../shared/normalize.js";
import {
  cacheKey,
  isFresh,
  MISSING_KEY_MESSAGE,
  publicMissWarning,
  type CacheKind,
} from "../../shared/provider.js";

const REGION = "US";
const SOUND_NOTE = "Observed on the fetched videos. Not a live music chart.";
const RATE_LIMIT_MESSAGE = "data provider rate-limited";

function absorbProviderError(error: unknown, warnings: string[]): "stop" | "miss" | "throw" {
  if (!isActionContractError(error)) return "throw";
  if (error.errorCode === "scrapecreators_key_missing") {
    warnings.push(MISSING_KEY_MESSAGE);
    return "stop";
  }
  if (error.errorCode === "provider_rate_limited") {
    warnings.push(RATE_LIMIT_MESSAGE);
    return "stop";
  }
  if (error.errorCode === "scrapecreators_credits") {
    warnings.push(error.message);
    return "stop";
  }
  if (error.errorCode === "not_found") return "miss";
  return "throw";
}

interface Cached<T> {
  data: T;
  configured: boolean;
  stale: boolean;
  warning: string | null;
}

async function throughCache<T>(
  actor: Actor,
  input: {
    kind: CacheKind;
    query: string;
    load: (apiKey: string) => Promise<T>;
  },
): Promise<Cached<T>> {
  const key = cacheKey(input.kind, input.query, REGION);
  const cached = await readCache<T>(actor.orgId, key);
  const fresh = cached ? isFresh(cached.expiresAt) : false;
  const apiKey = await readScrapeKey();
  if (fresh && cached) {
    return {
      data: cached.payload,
      configured: Boolean(apiKey),
      stale: false,
      warning: null,
    };
  }
  if (!apiKey) {
    if (cached) {
      return {
        data: cached.payload,
        configured: false,
        stale: true,
        warning: null,
      };
    }
    fail(MISSING_KEY_MESSAGE, {
      statusCode: 503,
      errorCode: "scrapecreators_key_missing",
    });
  }
  try {
    const data = await input.load(apiKey);
    await writeCache(actor, {
      cacheKey: key,
      kind: input.kind,
      query: input.query,
      payload: data,
    });
    return { data, configured: true, stale: false, warning: null };
  } catch (error) {
    if (
      cached &&
      isActionContractError(error) &&
      error.errorCode === "provider_rate_limited"
    ) {
      return {
        data: cached.payload,
        configured: true,
        stale: true,
        warning: "data provider rate-limited",
      };
    }
    throw error;
  }
}

export interface KeywordPacket {
  query: string;
  region: string;
  videos: ScoutVideo[];
  volume: ReturnType<typeof volumeProxy>;
  related: string[];
  intent: ReturnType<typeof inferIntent>;
  fetchedAt: string;
}

function keywordPacket(query: string, payload: unknown, source: SearchVsTrend): KeywordPacket {
  const videos = markOutliers(extractVideos(payload, source));
  return {
    query,
    region: REGION,
    videos,
    volume: volumeProxy(videos),
    related: relatedTerms(videos, query),
    intent: inferIntent(query),
    fetchedAt: new Date().toISOString(),
  };
}

export async function searchKeywords(actor: Actor, query: string, datePosted?: string) {
  const trimmed = query.trim();
  const hit = await throughCache(actor, {
    kind: "keyword",
    query: `${trimmed}|${datePosted ?? ""}`,
    load: async (apiKey) =>
      keywordPacket(
        trimmed,
        await searchKeyword(apiKey, { query: trimmed, region: REGION, datePosted }),
        "search",
      ),
  });
  return { ...hit.data, configured: hit.configured, stale: hit.stale, warning: hit.warning };
}

export async function searchHashtags(actor: Actor, tag: string) {
  const hashtag = tag.trim().replace(/^#/, "");
  const hit = await throughCache(actor, {
    kind: "hashtag",
    query: hashtag,
    load: async (apiKey) =>
      keywordPacket(
        `#${hashtag}`,
        await searchHashtag(apiKey, { hashtag, region: REGION }),
        "trend",
      ),
  });
  return { ...hit.data, configured: hit.configured, stale: hit.stale, warning: hit.warning };
}

export interface CompetitorPacket {
  profile: ScoutProfile;
  videos: ScoutVideo[];
  hooks: string[];
  ctas: string[];
  sounds: string[];
  soundNote: string;
  followerLike: ReturnType<typeof followerLikeHealth>;
  fetchedAt: string;
}

async function loadCompetitor(apiKey: string, handle: string): Promise<CompetitorPacket> {
  const profilePayload = await fetchProfile(apiKey, handle);
  const profile = extractProfile(profilePayload);
  if (!profile) {
    fail(`No public TikTok record for @${handle}.`, {
      statusCode: 404,
      errorCode: "not_found",
    });
  }
  let videos: ScoutVideo[] = [];
  try {
    const videoPayload = await fetchProfileVideos(apiKey, profile.handle, REGION);
    videos = markOutliers(extractVideos(videoPayload, "hybrid"));
  } catch (error) {
    if (!isActionContractError(error) || error.errorCode !== "not_found") throw error;
  }
  const sounds = [...new Set(videos.flatMap((video) => (video.soundName ? [video.soundName] : [])))].slice(0, 8);
  return {
    profile,
    videos,
    hooks: hookPatterns(videos),
    ctas: ctaPatterns(videos),
    sounds,
    soundNote: SOUND_NOTE,
    followerLike: followerLikeHealth(profile.followers, profile.likes),
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchCompetitor(
  actor: Actor,
  input: { handle: string; role?: string; displayName?: string },
) {
  const handle = input.handle.trim().replace(/^@/, "").toLowerCase();
  const brand = await readBrand(actor.orgId);
  const seed = brand.watchlist.find((item) => item.handle === handle);
  let hit: Cached<CompetitorPacket>;
  try {
    hit = await throughCache(actor, {
      kind: "profile-videos",
      query: handle,
      load: (apiKey) => loadCompetitor(apiKey, handle),
    });
  } catch (error) {
    if (isActionContractError(error) && error.errorCode === "not_found") {
      fail(`No public TikTok record for @${handle}.`, {
        statusCode: 404,
        errorCode: "not_found",
      });
    }
    throw error;
  }
  await upsertCompetitor(actor, {
    handle,
    displayName: hit.data.profile.displayName ?? input.displayName ?? seed?.displayName ?? null,
    role: input.role ?? seed?.role ?? "watch",
    snapshot: hit.data,
  });
  return { ...hit.data, configured: hit.configured, stale: hit.stale, warning: hit.warning, role: input.role ?? seed?.role ?? "watch" };
}

export async function discoverTrends(actor: Actor) {
  const brand = await readBrand(actor.orgId);
  const seeds = brand.seedKeywords.slice(0, 2);
  const terms: TrendTerm[] = [];
  const warnings: string[] = [];
  let configured = true;
  let stale = false;
  let halted = false;
  for (const seed of seeds) {
    try {
      const hit = await searchKeywords(actor, seed.term);
      configured = configured && hit.configured;
      stale = stale || hit.stale;
      if (hit.warning) warnings.push(hit.warning);
      const recent = hit.videos.filter((video) => withinDays(video, 14));
      const sample = recent.length > 0 ? recent : hit.videos;
      terms.push(classifyTerm(seed.term, sample));
    } catch (error) {
      const kind = absorbProviderError(error, warnings);
      if (kind === "miss") {
        warnings.push(`No public results for “${seed.term}”.`);
        continue;
      }
      if (kind === "stop") {
        halted = true;
        break;
      }
      throw error;
    }
  }
  let feedVideos: ScoutVideo[] = [];
  if (!halted) {
    try {
      const feed = await throughCache(actor, {
        kind: "trending",
        query: "feed",
        load: async (apiKey) => {
          const videos = markOutliers(extractVideos(await fetchTrending(apiKey), "trend"));
          return { videos, fetchedAt: new Date().toISOString() };
        },
      });
      configured = configured && feed.configured;
      stale = stale || feed.stale;
      if (feed.warning) warnings.push(feed.warning);
      feedVideos = feed.data.videos;
    } catch (error) {
      const kind = absorbProviderError(error, warnings);
      if (kind === "stop") halted = true;
      else if (kind !== "miss") throw error;
    }
  }
  const flash = feedVideos.filter((video) => withinDays(video, 3));
  terms.push(classifyTerm("Trending feed", flash.length > 0 ? flash : feedVideos));
  const saved = await listCompetitors(actor.orgId);
  const seenLabels = new Set(terms.map((term) => term.label.toLowerCase()));
  for (const term of competitorCaptionTerms(
    saved.flatMap((row) => snapshotVideos(row.snapshotJson)),
  )) {
    if (seenLabels.has(term.label.toLowerCase())) continue;
    seenLabels.add(term.label.toLowerCase());
    terms.push(term);
  }
  const packet = {
    windowDays: 14,
    terms,
    fetchedAt: new Date().toISOString(),
    creditNote:
      "Up to two seed keyword searches and one trending feed. Caption and hashtag terms come from saved competitor snapshots and do not add searches. Cached hits are free.",
  };
  const id = await insertReport(actor, {
    kind: "trends",
    title: "Discover trends",
    packet,
  });
  return { id, ...packet, configured, stale, halted, warning: warnings[0] ?? null };
}

export async function auditPage(actor: Actor, handleInput: string) {
  const packet = await fetchCompetitor(actor, { handle: handleInput, role: "watch" });
  const views = packet.videos
    .map((video) => video.views)
    .filter((value): value is number => value != null);
  const avgViews = views.length
    ? Math.round(views.reduce((sum, value) => sum + value, 0) / views.length)
    : null;
  const clusters = new Map<string, number>();
  for (const video of packet.videos) {
    for (const tag of video.hashtags) clusters.set(tag, (clusters.get(tag) ?? 0) + 1);
  }
  const emptyFollow = packet.videos.filter((video) => hasEmptyFollowCta(video.caption)).length;
  const summary = {
    handle: packet.profile.handle,
    profile: packet.profile,
    topicClusters: [...clusters.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    avgViews,
    winners: packet.videos.filter((video) => video.outlier).slice(0, 5),
    videos: packet.videos,
    heatmap: postingHeatmap(packet.videos, (await readBrand(actor.orgId)).firstHourReply),
    followerLike: packet.followerLike,
    followerLikeTargetPct: 15,
    ctaQuality: {
      emptyFollowCount: emptyFollow,
      note:
        emptyFollow > 0
          ? "Some captions end on follow-for-more. Outcome CTAs hold follower÷like health better."
          : "No empty follow-for-more line in this sample.",
    },
    limitations: [
      "Public sample only. Not private analytics, and not a view oracle.",
      packet.soundNote,
    ],
  };
  const id = await insertAudit(actor, packet.profile.handle, summary);
  return {
    id,
    summary,
    configured: packet.configured,
    stale: packet.stale,
    warning: packet.warning,
    nextRequiredAction: "scout-save-audit",
  };
}

function snapshotVideos(snapshotJson: string): ScoutVideo[] {
  const snapshot = parseJson<{ videos?: ScoutVideo[] }>(snapshotJson, {});
  return Array.isArray(snapshot.videos) ? snapshot.videos : [];
}

export async function intelligenceReport(actor: Actor) {
  const discovered = await discoverTrends(actor);
  const brand = await readBrand(actor.orgId);
  const saved = await listCompetitors(actor.orgId);
  const freshHandles = new Set(
    saved
      .filter((row) => {
        const snapshot = parseJson<{ fetchedAt?: string }>(row.snapshotJson, {});
        if (!snapshot.fetchedAt) return false;
        return Date.now() - Date.parse(snapshot.fetchedAt) < 6 * 60 * 60 * 1000;
      })
      .map((row) => row.handle),
  );
  const pending = brand.watchlist.filter((seed) => !freshHandles.has(seed.handle)).slice(0, 4);
  const warnings = [discovered.warning].filter((item): item is string => Boolean(item));
  const missed: { handle: string; displayName: string }[] = [];
  if (!discovered.halted) {
    for (const seed of pending) {
      try {
        await fetchCompetitor(actor, seed);
      } catch (error) {
        const kind = absorbProviderError(error, warnings);
        if (kind === "miss") {
          missed.push({ handle: seed.handle, displayName: seed.displayName });
          continue;
        }
        if (kind === "stop") break;
        throw error;
      }
    }
  }
  const board = await listDashboard(actor, {
    searchVsTrend: "all",
    geo: "all",
    dyno: "all",
  });
  const missWarning = publicMissWarning(missed.map((item) => item.handle));
  const packet = {
    generatedAt: new Date().toISOString(),
    terms: discovered.terms,
    breakouts: board.breakouts,
    watchlist: board.watchlist,
    pulse: board.pulse,
    missedHandles: missed,
    creditNote: "Refresh spends credits only for stale seed searches, the trending feed, and up to four watchlist profiles. A missing public record is skipped.",
  };
  const id = await insertReport(actor, {
    kind: "intelligence",
    title: "Niche pulse",
    packet,
  });
  return {
    id,
    ...packet,
    configured: discovered.configured,
    stale: discovered.stale,
    warning: [missWarning, ...warnings].filter((item): item is string => Boolean(item)).join(" ") || null,
    nextRequiredAction: "scout-save-report",
  };
}

const MAX_WATCH_SEEDS = 8;

export async function watchAllSeeds(actor: Actor) {
  const brand = await readBrand(actor.orgId);
  const saved = await listCompetitors(actor.orgId);
  const fetched = new Set(
    saved
      .filter((row) => {
        const snapshot = parseJson<CompetitorPacket>(row.snapshotJson, {} as CompetitorPacket);
        return Boolean(snapshot.profile);
      })
      .map((row) => row.handle),
  );
  const pending = brand.watchlist.filter((seed) => !fetched.has(seed.handle)).slice(0, MAX_WATCH_SEEDS);
  const warnings: string[] = [];
  const missed: { handle: string; displayName: string }[] = [];
  let watched = 0;
  for (const seed of pending) {
    try {
      await fetchCompetitor(actor, seed);
      watched += 1;
    } catch (error) {
      const kind = absorbProviderError(error, warnings);
      if (kind === "miss") {
        missed.push({ handle: seed.handle, displayName: seed.displayName });
        continue;
      }
      if (kind === "stop") break;
      throw error;
    }
  }
  const missWarning = publicMissWarning(missed.map((item) => item.handle));
  await rememberIntelligenceMisses(actor.orgId, missed);
  return {
    watched,
    remaining: Math.max(0, pending.length - watched - missed.length),
    missedHandles: missed,
    warning: [missWarning, ...warnings].filter((item): item is string => Boolean(item)).join(" ") || null,
    message:
      watched > 0
        ? `Watched ${watched} seed account${watched === 1 ? "" : "s"}.`
        : missed.length > 0
          ? "Those seed accounts have no public TikTok record."
          : "Seed accounts were already watched.",
  };
}

export async function recreateFromHit(
  actor: Actor,
  input: {
    caption: string;
    handle?: string | null;
    url?: string | null;
    soundName?: string | null;
    searchVsTrend: SearchVsTrend;
    geo?: string | null;
    videoId?: string | null;
  },
) {
  const brand = await readBrand(actor.orgId);
  const card = skeletonRecreate({
    brand,
    caption: input.caption,
    handle: input.handle ?? null,
    url: input.url ?? null,
    soundName: input.soundName ?? null,
    searchVsTrend: input.searchVsTrend,
    geo: input.geo ?? null,
  });
  const paste = buildPastePack(card);
  const id = await insertRecreate(actor, {
    sourceVideoId: input.videoId ?? null,
    sourceHandle: input.handle ?? null,
    sourceUrl: input.url ?? null,
    card,
    paste,
    status: "draft",
  });
  return {
    id,
    card,
    paste,
    status: "draft" as const,
    nextRequiredAction: "scout-save-recreate",
    summary:
      "Structural paste pack is saved. Rewrite the lines in shop voice with the strongest configured model, then call scout-save-recreate. Do not use a mini, flash, or haiku default.",
  };
}

export async function saveRecreate(
  actor: Actor,
  id: string,
  patch: Partial<RecreateCard>,
) {
  const existing = await readRecreate(actor.orgId, id);
  if (!existing) {
    fail("Recreate was not found.", { statusCode: 404, errorCode: "not_found" });
  }
  const brand = await readBrand(actor.orgId);
  const previous = parseJson<RecreateCard>(existing.cardJson, skeletonRecreate({
    brand,
    caption: "shop job",
    handle: null,
    url: null,
    soundName: null,
    searchVsTrend: "hybrid",
    geo: null,
  }));
  const merged = enforceCard(
    {
      ...previous,
      ...patch,
      capCutSceneOutline: (patch.capCutSceneOutline ?? previous.capCutSceneOutline).map(
        (scene) => ({
          ...scene,
          durationSec: Math.min(5, Math.max(3, Math.round(scene.durationSec))),
        }),
      ),
      originalShoot: true,
    },
    brand,
  );
  const paste = buildPastePack(merged);
  await updateRecreate(actor, id, { card: merged, paste, status: "ready" });
  return { id, card: merged, paste, status: "ready" as const };
}

export async function draftCopy(
  actor: Actor,
  input: { kind: "hook" | "script" | "caption"; topic: string },
) {
  const brand = await readBrand(actor.orgId);
  const card = skeletonRecreate({
    brand,
    caption: input.topic,
    handle: brand.handle,
    url: null,
    soundName: null,
    searchVsTrend: "hybrid",
    geo: brand.geos[0] ?? null,
  });
  const body = draftBody(input.kind, card);
  const id = await insertDraft(actor, { kind: input.kind, topic: input.topic, body });
  return {
    id,
    kind: input.kind,
    topic: input.topic,
    body,
    card,
    growthPrincipleTags: card.growthPrincipleTags,
    nextRequiredAction: "scout-save-draft",
    summary:
      "Preview draft is saved. Rewrite it in shop voice with the strongest configured model, then call scout-save-draft. Do not use a mini, flash, or haiku default.",
  };
}

export async function saveDraft(actor: Actor, id: string, body: string) {
  const brand = await readBrand(actor.orgId);
  const clean = scrubCopy(body, brand.dynoUnlocked, brand.softCta);
  const saved = await updateDraft(actor, id, clean);
  if (!saved) fail("Draft was not found.", { statusCode: 404, errorCode: "not_found" });
  return { id, body: clean };
}

export async function saveAuditNote(actor: Actor, id: string, narrative: string) {
  const brand = await readBrand(actor.orgId);
  const clean = scrubCopy(narrative, brand.dynoUnlocked, brand.softCta);
  const saved = await saveAuditNarrative(actor, id, clean);
  if (!saved) fail("Audit was not found.", { statusCode: 404, errorCode: "not_found" });
  return { id, narrative: clean };
}

export async function saveReportNote(actor: Actor, id: string, narrative: string) {
  const brand = await readBrand(actor.orgId);
  const clean = scrubCopy(narrative, brand.dynoUnlocked, brand.softCta);
  const saved = await saveReportNarrative(actor, id, clean);
  if (!saved) fail("Report was not found.", { statusCode: 404, errorCode: "not_found" });
  return { id, narrative: clean, status: "written" as const };
}

export async function bestTime(actor: Actor, handle?: string) {
  const brand = await readBrand(actor.orgId);
  const rows = await listCompetitors(actor.orgId);
  const audits = await listAudits(actor.orgId);
  const videos: ScoutVideo[] = [];
  const seen = new Set<string>();
  const wanted = handle?.trim().replace(/^@/, "").toLowerCase();
  for (const row of rows) {
    if (wanted && row.handle !== wanted) continue;
    for (const video of snapshotVideos(row.snapshotJson)) {
      if (seen.has(video.id)) continue;
      seen.add(video.id);
      videos.push(video);
    }
  }
  for (const audit of audits) {
    if (wanted && audit.handle !== wanted) continue;
    const summary = parseJson<{ videos?: ScoutVideo[] }>(audit.summaryJson, {});
    for (const video of summary.videos ?? []) {
      if (seen.has(video.id)) continue;
      seen.add(video.id);
      videos.push(video);
    }
  }
  return {
    ...postingHeatmap(videos, brand.firstHourReply),
    sampleSize: videos.length,
    handle: wanted ?? null,
  };
}

export async function listDashboard(actor: Actor, filters: BoardFilters) {
  const brand = await readBrand(actor.orgId);
  const rows = await listCompetitors(actor.orgId);
  const byHandle = new Map(rows.map((row) => [row.handle, row]));
  const watchlist = brand.watchlist.map((seed) => {
    const row = byHandle.get(seed.handle);
    const snapshot = row
      ? parseJson<CompetitorPacket>(row.snapshotJson, {} as CompetitorPacket)
      : null;
    return {
      handle: seed.handle,
      displayName: row?.displayName ?? seed.displayName,
      role: row?.role ?? seed.role,
      fetched: Boolean(snapshot?.profile),
      missed: false,
      followers: snapshot?.profile?.followers ?? null,
      outlierCount: snapshot?.videos?.filter((video) => video.outlier).length ?? 0,
    };
  });
  for (const row of rows) {
    if (watchlist.some((item) => item.handle === row.handle)) continue;
    const snapshot = parseJson<CompetitorPacket>(row.snapshotJson, {} as CompetitorPacket);
    watchlist.push({
      handle: row.handle,
      displayName: row.displayName ?? snapshot.profile?.displayName ?? row.handle,
      role: row.role,
      fetched: Boolean(snapshot.profile),
      missed: false,
      followers: snapshot.profile?.followers ?? null,
      outlierCount: snapshot.videos?.filter((video) => video.outlier).length ?? 0,
    });
  }
  const breakouts = rows
    .flatMap((row) => snapshotVideos(row.snapshotJson))
    .filter((video) => video.outlier && keepHit(video, filters));
  const trends = await latestReport(actor.orgId, "trends");
  const intelligence = await latestReport(actor.orgId, "intelligence");
  const trendPacket = trends
    ? parseJson<{ terms?: TrendTerm[] }>(trends.packetJson, {})
    : {};
  const terms = (trendPacket.terms ?? []).filter((term) =>
    keepHit(
      { searchVsTrend: term.searchVsTrend, geo: null, dynoSafe: term.dynoSafe },
      { ...filters, geo: "all" },
    ),
  );
  const recreates = (await listRecreates(actor.orgId)).map(presentRecreate);
  const drafts = await listDrafts(actor.orgId);
  const audits = (await listAudits(actor.orgId)).map((row) => ({
    id: row.id,
    handle: row.handle,
    narrative: row.narrative,
    createdAt: row.createdAt,
  }));
  const pulse = await readPulseEnrichment(actor.orgId);
  const configured = Boolean(await readScrapeKey());
  const intelligencePacket = intelligence
    ? parseJson<{ missedHandles?: { handle: string; displayName: string }[] }>(
        intelligence.packetJson,
        {},
      )
    : {};
  const missedHandles = (intelligencePacket.missedHandles ?? []).filter(
    (item): item is { handle: string; displayName: string } =>
      Boolean(item && typeof item.handle === "string" && !watchlist.some((row) => row.handle === item.handle && row.fetched)),
  );
  const missedSet = new Set(missedHandles.map((item) => item.handle));
  for (const row of watchlist) {
    if (!row.fetched && missedSet.has(row.handle)) row.missed = true;
  }
  return {
    configured,
    brand: publicBrand(brand),
    filters,
    breakouts,
    terms,
    watchlist,
    recreates,
    drafts,
    audits,
    pulse,
    missedHandles,
    missedWarning: publicMissWarning(missedHandles.map((item) => item.handle)),
    intelligence: intelligence
      ? { id: intelligence.id, narrative: intelligence.narrative, createdAt: intelligence.createdAt }
      : null,
    seeds: brand.seedKeywords,
  };
}

function publicBrand(brand: BrandConfig) {
  return {
    displayName: brand.displayName,
    handle: brand.handle,
    niche: brand.niche,
    softCta: brand.softCta,
    dynoUnlocked: brand.dynoUnlocked,
    firstHourReply: brand.firstHourReply,
    geos: brand.geos,
  };
}

function presentRecreate(row: {
  id: string;
  cardJson: string;
  pasteJson: string;
  status: string;
  createdAt: string;
  sourceHandle: string | null;
  sourceUrl: string | null;
}) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    sourceHandle: row.sourceHandle,
    sourceUrl: row.sourceUrl,
    card: parseJson<RecreateCard | null>(row.cardJson, null),
    paste: parseJson<ReturnType<typeof buildPastePack> | null>(row.pasteJson, null),
  };
}

export async function providerStatus() {
  return { configured: Boolean(await readScrapeKey()) };
}

export async function pushToPulse(actor: Actor, id: string) {
  const row = await readRecreate(actor.orgId, id);
  if (!row) fail("Recreate was not found.", { statusCode: 404, errorCode: "not_found" });
  const card = parseJson<RecreateCard>(row.cardJson, {} as RecreateCard);
  try {
    const ideaId = await sendPulseIdea(actor, {
      title: card.title,
      notes: card.hook,
      pillar: card.pillar,
      searchVsTrend: card.searchVsTrend,
      dynoSafe: card.dynoSafe,
      geo: card.geo,
      softCta: card.softCta,
      sourceId: row.id,
    });
    return { id: ideaId, sent: true, message: `Sent “${card.title}” to the Pulse backlog.` };
  } catch {
    return {
      id: null,
      sent: false,
      message: "Pulse backlog is not available in this database yet.",
    };
  }
}
