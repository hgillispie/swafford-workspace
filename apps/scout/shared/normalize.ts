import type { Geo, SearchVsTrend } from "./brand.js";
import { isDynoHeroClaim } from "./guardrails.js";

export interface ScoutVideo {
  id: string;
  url: string;
  handle: string;
  displayName: string | null;
  caption: string;
  postedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  durationSec: number | null;
  soundName: string | null;
  hashtags: string[];
  searchVsTrend: SearchVsTrend;
  geo: Geo | null;
  dynoSafe: boolean;
  outlier: boolean;
  outlierScore: number | null;
}

export interface ScoutProfile {
  handle: string;
  displayName: string | null;
  signature: string | null;
  followers: number | null;
  following: number | null;
  likes: number | null;
  videoCount: number | null;
  verified: boolean;
}

const GEO_RULES: { geo: Geo; pattern: RegExp }[] = [
  { geo: "upstate_sc", pattern: /\b(greenville|spartanburg|upstate)\b/i },
  { geo: "wnc", pattern: /\b(asheville|wnc|western north carolina)\b/i },
  { geo: "east_tn", pattern: /\b(knoxville|east tennessee|tri-cities)\b/i },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashtagsFrom(caption: string): string[] {
  return [...caption.matchAll(/#([\w]+)/g)].map((match) => match[1]!.toLowerCase());
}

export function inferGeo(text: string): Geo | null {
  for (const rule of GEO_RULES) {
    if (rule.pattern.test(text)) return rule.geo;
  }
  return null;
}

export function inferIntent(
  query: string,
): "informational" | "how_to" | "local_shop" | "product" | "entertainment" | "mixed" {
  const q = query.toLowerCase();
  if (/\b(how|why|what|fix|diagnos)/.test(q)) return "how_to";
  if (/\b(greenville|asheville|shop|near|upstate)\b/.test(q)) return "local_shop";
  if (/\b(exhaust|part|buy|kit)\b/.test(q)) return "product";
  if (/\?/.test(q)) return "informational";
  return "mixed";
}

function postedIso(value: unknown): string | null {
  const n = num(value);
  if (n == null) return null;
  const ms = n > 10_000_000_000 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function videoFromAweme(
  raw: Record<string, unknown>,
  source: SearchVsTrend,
): ScoutVideo | null {
  const id = str(raw.aweme_id) ?? str(raw.awemeId) ?? str(raw.id);
  const author = asRecord(raw.author) ?? {};
  const handle =
    str(author.unique_id) ?? str(author.uniqueId) ?? str(raw.author_unique_id) ?? "";
  if (!id || !handle) return null;
  const stats = asRecord(raw.statistics) ?? asRecord(raw.stats) ?? {};
  const music = asRecord(raw.music) ?? asRecord(raw.added_sound_music_info) ?? {};
  const caption = (str(raw.desc) ?? str(raw.caption) ?? "").slice(0, 500);
  const duration = num(raw.duration);
  const video = asRecord(raw.video);
  const durationSec =
    duration == null
      ? num(video?.duration)
      : duration > 1000
        ? Math.round(duration / 1000)
        : duration;
  return {
    id,
    url: str(raw.share_url) ?? `https://www.tiktok.com/@${handle}/video/${id}`,
    handle: handle.replace(/^@/, "").toLowerCase(),
    displayName: str(author.nickname) ?? str(author.nick_name),
    caption,
    postedAt: postedIso(raw.create_time ?? raw.createTime),
    views: num(stats.play_count) ?? num(stats.playCount),
    likes: num(stats.digg_count) ?? num(stats.diggCount),
    comments: num(stats.comment_count) ?? num(stats.commentCount),
    shares: num(stats.share_count) ?? num(stats.shareCount),
    durationSec,
    soundName: str(music.title) ?? str(music.author),
    hashtags: hashtagsFrom(caption),
    searchVsTrend: source,
    geo: inferGeo(caption),
    dynoSafe: !isDynoHeroClaim(caption),
    outlier: false,
    outlierScore: null,
  };
}

function collectRaw(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    });
  }
  const root = asRecord(payload);
  if (!root) return [];
  const lists = [root.search_item_list, root.aweme_list, root.itemList, root.videos];
  const raw: Record<string, unknown>[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const record = asRecord(item);
      if (!record) continue;
      const nested = asRecord(record.aweme_info) ?? asRecord(record.awemeInfo);
      raw.push(nested ?? record);
    }
  }
  return raw;
}

export function extractVideos(payload: unknown, source: SearchVsTrend): ScoutVideo[] {
  const seen = new Set<string>();
  const videos: ScoutVideo[] = [];
  for (const raw of collectRaw(payload)) {
    const video = videoFromAweme(raw, source);
    if (!video || seen.has(video.id)) continue;
    seen.add(video.id);
    videos.push(video);
  }
  return videos.slice(0, 20);
}

export function markOutliers(videos: ScoutVideo[]): ScoutVideo[] {
  const views = videos
    .map((video) => video.views)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  if (views.length < 4) {
    return videos.map((video) => ({ ...video, outlier: false, outlierScore: null }));
  }
  const mid = Math.floor(views.length / 2);
  const median = views.length % 2 === 0 ? (views[mid - 1]! + views[mid]!) / 2 : views[mid]!;
  if (median <= 0) return videos;
  return videos.map((video) => {
    if (video.views == null) return { ...video, outlier: false, outlierScore: null };
    const score = Math.round((video.views / median) * 10) / 10;
    return { ...video, outlier: score >= 2, outlierScore: score };
  });
}

export function extractProfile(payload: unknown): ScoutProfile | null {
  const root = asRecord(payload);
  if (!root) return null;
  const user = asRecord(root.user) ?? asRecord(root.user_info);
  if (!user) return null;
  const stats = asRecord(root.stats) ?? user;
  const handle = str(user.uniqueId) ?? str(user.unique_id);
  if (!handle) return null;
  return {
    handle: handle.replace(/^@/, "").toLowerCase(),
    displayName: str(user.nickname) ?? str(user.nick_name),
    signature: str(user.signature),
    followers:
      num(stats.followerCount) ?? num(stats.follower_count) ?? num(user.follower_count),
    following: num(stats.followingCount) ?? num(stats.following_count),
    likes: num(stats.heartCount) ?? num(stats.heart) ?? num(user.total_favorited),
    videoCount: num(stats.videoCount) ?? num(user.aweme_count),
    verified: user.verified === true,
  };
}

export interface VolumeProxy {
  volumeProxy: "very_high" | "high" | "medium" | "low" | "unknown";
  competitionProxy: "high" | "medium" | "low" | "unknown";
  note: string;
}

export function volumeProxy(videos: ScoutVideo[]): VolumeProxy {
  const note = "Proxy from this public sample. Not Google Ads monthly search volume.";
  const views = videos
    .map((video) => video.views)
    .filter((value): value is number => value != null);
  if (views.length === 0) {
    return { volumeProxy: "unknown", competitionProxy: "unknown", note };
  }
  const sorted = [...views].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const volume =
    median >= 250_000 ? "very_high" : median >= 50_000 ? "high" : median >= 8_000 ? "medium" : "low";
  const handles = new Set(videos.map((video) => video.handle)).size;
  const ratio = handles / videos.length;
  const competition =
    videos.length < 3 ? "unknown" : ratio > 0.75 ? "high" : ratio > 0.4 ? "medium" : "low";
  return { volumeProxy: volume, competitionProxy: competition, note };
}

export function relatedTerms(videos: ScoutVideo[], query: string): string[] {
  const skip = new Set(query.toLowerCase().split(/\s+/));
  const counts = new Map<string, number>();
  for (const video of videos) {
    for (const tag of video.hashtags) {
      if (skip.has(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag]) => tag);
}

export interface TrendTerm {
  label: string;
  classification: "mega_trend" | "flash_24_72h" | "topic";
  halfLifeDays: number;
  searchVsTrend: SearchVsTrend;
  dynoSafe: boolean;
  exampleVideos: ScoutVideo[];
  whyNow: string;
}

export function classifyTerm(label: string, videos: ScoutVideo[], now = Date.now()): TrendTerm {
  const day = 24 * 60 * 60 * 1000;
  const ages = videos
    .map((video) => (video.postedAt ? now - Date.parse(video.postedAt) : null))
    .filter((age): age is number => age != null && age >= 0);
  const under72 = ages.filter((age) => age <= 3 * day).length;
  const span = ages.length ? (Math.max(...ages) - Math.min(...ages)) / day : 0;
  const flash = ages.length > 0 && under72 / ages.length >= 0.6;
  const classification = flash ? "flash_24_72h" : span >= 7 ? "mega_trend" : "topic";
  return {
    label,
    classification,
    halfLifeDays: flash ? 2 : span >= 7 ? 14 : 7,
    searchVsTrend: flash ? "trend" : "hybrid",
    dynoSafe: videos.every((video) => video.dynoSafe),
    exampleVideos: videos.slice(0, 5),
    whyNow: flash
      ? `${under72} of ${ages.length || videos.length} dated posts in this sample are under 72 hours old.`
      : `Sample spans about ${Math.round(span)} days. Treat it as a longer topic, not a one-day spike.`,
  };
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export interface HeatSlot {
  dayOfWeek: (typeof DAYS)[number];
  hour: number;
  count: number;
  medianViews: number | null;
}

export interface Heatmap {
  timezone: "America/New_York";
  slots: HeatSlot[];
  recommended: {
    dayOfWeek: string;
    localTime: string;
    reason: string;
    source: "competitor_heatmap";
  }[];
  grid: number[][];
  caveat: string;
  firstHourReply: string;
}

export function postingHeatmap(
  videos: ScoutVideo[],
  firstHourReply: string,
): Heatmap {
  const buckets = new Map<string, number[]>();
  for (const video of videos) {
    if (!video.postedAt) continue;
    const date = new Date(video.postedAt);
    if (Number.isNaN(date.getTime())) continue;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const weekday = parts
      .find((part) => part.type === "weekday")
      ?.value?.slice(0, 3)
      .toLowerCase();
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const day = DAYS.find((item) => item === weekday);
    if (!day || !Number.isInteger(hour)) continue;
    const key = `${day}:${hour}`;
    const list = buckets.get(key) ?? [];
    list.push(video.views ?? 0);
    buckets.set(key, list);
  }
  const slots: HeatSlot[] = [...buckets.entries()].map(([key, views]) => {
    const [dayOfWeek, hourText] = key.split(":");
    const sorted = [...views].sort((a, b) => a - b);
    return {
      dayOfWeek: dayOfWeek as HeatSlot["dayOfWeek"],
      hour: Number(hourText),
      count: views.length,
      medianViews: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null,
    };
  });
  slots.sort((a, b) => b.count - a.count || (b.medianViews ?? 0) - (a.medianViews ?? 0));
  const grid = DAYS.map((day) =>
    Array.from({ length: 8 }, (_, bucket) =>
      slots
        .filter((slot) => slot.dayOfWeek === day && Math.floor(slot.hour / 3) === bucket)
        .reduce((sum, slot) => sum + slot.count, 0),
    ),
  );
  return {
    timezone: "America/New_York",
    slots,
    recommended: slots.slice(0, 3).map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      localTime: `${String(slot.hour).padStart(2, "0")}:00`,
      reason: `${slot.count} fetched posts landed in this hour (ET).`,
      source: "competitor_heatmap" as const,
    })),
    grid,
    caveat:
      videos.length < 8
        ? "Thin sample. These hours are from the posts we fetched, not a platform oracle."
        : "Hours are counted from fetched public timestamps in America/New_York. Not a reach oracle.",
    firstHourReply,
  };
}

export function hookPatterns(videos: ScoutVideo[]): string[] {
  const counts = new Map<string, number>();
  for (const video of videos) {
    const line = video.caption.replace(/#[\w]+/g, "").trim().slice(0, 48).toLowerCase();
    if (line.length < 8) continue;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([line]) => line);
}

export function ctaPatterns(videos: ScoutVideo[]): string[] {
  const found = new Set<string>();
  for (const video of videos) {
    const bits = video.caption.split(/(?<=[.!?])\s+/);
    const last = bits[bits.length - 1] ?? "";
    if (/\b(book|comment|link in bio|shop|dm|follow)\b/i.test(last)) found.add(last.slice(0, 80));
  }
  return [...found].slice(0, 5);
}

export function withinDays(video: ScoutVideo, days: number, now = Date.now()): boolean {
  if (!video.postedAt) return false;
  const age = now - Date.parse(video.postedAt);
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
}
