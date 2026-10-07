import {
  ctaQuality,
  FOLLOWER_LIKE_TARGET_PCT,
  normalizeHandle,
} from "../../shared/pulse-guardrails.js";
import { listCompetitors, windowsForReport } from "./pulse-read.js";

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "your",
  "you",
  "harley",
  "davidson",
  "video",
  "https",
]);

export const AUDIT_LIMITATIONS = [
  "v1 does not use TikTok Login Kit or official page analytics.",
  "Pulse does not scrape TikTok. Numbers come from Brandbot pulses already stored here.",
  "If this handle is missing from the latest pulse, the summary stays empty on purpose.",
  "Follower÷likes uses stored followers and total likes when both exist. Target is about 15% or higher.",
  "Best days and times are the latest pulse heatmap proxy (competitor or niche), not this account's official analytics.",
  "Topic clusters bucket words from stored captions. Thin samples stay thin.",
  "Daily or weekly notes on the latest posts only appear when the pulse stored top videos for this handle.",
];

function tokens(caption: string): string[] {
  return caption
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

export async function buildAccountAudit(input: {
  orgId: string;
  reportId: string | null;
  raw: string;
}) {
  const handle = normalizeHandle(input.raw);
  const url = /tiktok\.com/i.test(input.raw)
    ? input.raw.trim()
    : handle
      ? `https://www.tiktok.com/@${handle}`
      : null;
  const competitors = input.reportId
    ? await listCompetitors(input.orgId, input.reportId)
    : [];
  const match =
    competitors.find((row) => row.handle.toLowerCase() === handle) ?? null;
  const windows = input.reportId
    ? await windowsForReport(input.reportId, input.orgId)
    : null;
  const videos = match?.topVideos ?? [];
  const buckets = new Map<string, { views: number[]; count: number }>();
  for (const video of videos) {
    const views = video.views ?? null;
    for (const token of tokens(video.caption ?? "")) {
      const bucket = buckets.get(token) ?? { views: [], count: 0 };
      bucket.count += 1;
      if (typeof views === "number") bucket.views.push(views);
      buckets.set(token, bucket);
    }
  }
  const topicClusters = [...buckets.entries()]
    .map(([topic, bucket]) => ({
      topic,
      posts: bucket.count,
      avgViews:
        bucket.views.length === 0
          ? null
          : Math.round(
              bucket.views.reduce((sum, value) => sum + value, 0) /
                bucket.views.length,
            ),
    }))
    .sort((a, b) => (b.avgViews ?? 0) - (a.avgViews ?? 0))
    .slice(0, 8);

  const followerLikeHealthPct =
    match?.followerLikeHealthPct ??
    (match?.followers && match.totalLikes
      ? Math.round((match.followers / match.totalLikes) * 1000) / 10
      : null);

  const cta = ctaQuality(match?.ctaPatterns ?? []);
  const ideas = videos.slice(0, 4).map((video) => ({
    title: `Original shoot inspired by @${handle}`,
    note: video.caption
      ? `Format reference only: ${video.caption.slice(0, 140)}`
      : "Format reference only. Film an original Swafford take.",
    views: video.views ?? null,
  }));

  return {
    handle,
    url,
    foundInPulse: Boolean(match),
    role: match?.role ?? null,
    section: match?.section ?? null,
    followers: match?.followers ?? null,
    totalLikes: match?.totalLikes ?? null,
    medianViews: match?.medianViews ?? null,
    maxViews: match?.maxViews ?? null,
    postsPerWeek: match?.postsPerWeek ?? null,
    followerLikeHealthPct,
    followerLikeTargetPct: FOLLOWER_LIKE_TARGET_PCT,
    followerLikeHealthy:
      followerLikeHealthPct == null
        ? null
        : followerLikeHealthPct >= FOLLOWER_LIKE_TARGET_PCT,
    topicClusters,
    ideasFromWinners: ideas,
    hookPatterns: match?.hookPatterns ?? [],
    cta,
    bestSlots: windows?.recommendedSlots ?? [],
    heatmapBasis:
      windows && "basis" in (windows.heatmapProxy as object)
        ? (windows.heatmapProxy as { basis?: string }).basis ?? null
        : null,
    caveat: windows?.caveat ?? null,
    sample: match?.sample ?? null,
    latestPosts: videos,
    limitations: AUDIT_LIMITATIONS,
    methodology:
      "Structured read of the latest stored Brandbot pulse. No live TikTok request was made.",
  };
}
