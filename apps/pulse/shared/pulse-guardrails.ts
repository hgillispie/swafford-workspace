import type { PulseIngest, PulseRecreateCard } from "./pulse-schema.js";

export const SOFT_CTA =
  "Book performance work — swaffordspeed.com · 864-666-9451";

export const FOLLOWER_LIKE_TARGET_PCT = 15;

const HERO_CLAIM =
  /\b(dyno(?:'d|ed)|put it on the dyno|dyno\s*(?:tune|tuning|tuned|sheet|numbers|hero|queen|pull|run|graph)s?)\b/i;

const FOLLOW_FOR_MORE = /\bfollow for more\b/i;

export function isDynoHeroClaim(text: string): boolean {
  return HERO_CLAIM.test(text);
}

export function hasEmptyFollowCta(text: string): boolean {
  return FOLLOW_FOR_MORE.test(text);
}

export function effectiveDynoUnlocked(adminUnlocked: boolean): boolean {
  return adminUnlocked;
}

function scrub(text: string, unlocked: boolean): string {
  let next = text;
  if (hasEmptyFollowCta(next)) next = SOFT_CTA;
  if (!unlocked && isDynoHeroClaim(next)) {
    next = next.replace(HERO_CLAIM, "performance work");
  }
  return next;
}

export function enforceCard(
  card: PulseRecreateCard,
  adminUnlocked: boolean,
): PulseRecreateCard {
  const unlocked = effectiveDynoUnlocked(adminUnlocked);
  return {
    ...card,
    dynoSafe: unlocked ? card.dynoSafe : true,
    hook: scrub(card.hook, unlocked),
    onScreenText: scrub(card.onScreenText, unlocked),
    captionLine1: scrub(card.captionLine1, unlocked),
    captionBody:
      card.captionBody == null ? card.captionBody : scrub(card.captionBody, unlocked),
    softCta: scrub(card.softCta, unlocked) || SOFT_CTA,
    spokenKeywordFirstSecond: card.spokenKeywordFirstSecond
      ? scrub(card.spokenKeywordFirstSecond, unlocked)
      : card.spokenKeywordFirstSecond,
  };
}

export function enforceIngest(
  payload: PulseIngest,
  adminUnlocked: boolean,
): PulseIngest {
  const unlocked = effectiveDynoUnlocked(adminUnlocked);
  return {
    ...payload,
    recreateCards: payload.recreateCards.map((card) =>
      enforceCard(card, unlocked),
    ),
    keywords: payload.keywords.map((keyword) => ({
      ...keyword,
      dynoSafe: unlocked ? keyword.dynoSafe : true,
    })),
    trendingTerms: payload.trendingTerms.map((term) => ({
      ...term,
      dynoSafe: unlocked ? term.dynoSafe : true,
    })),
    aheadOfCurve: payload.aheadOfCurve.map((term) => ({
      ...term,
      dynoSafe: unlocked ? term.dynoSafe : true,
    })),
  };
}

export interface PastePack {
  caption: string;
  capcut: string;
  descript: string;
  markdown: string;
}

function tags(card: PulseRecreateCard): string {
  return card.hashtags
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
}

export function buildPastePack(card: PulseRecreateCard): PastePack {
  const caption = [
    card.captionLine1,
    card.captionBody ?? "",
    tags(card),
    card.inviteKeywordComment ? `Comment prompt: ${card.inviteKeywordComment}` : "",
    card.softCta,
  ]
    .filter(Boolean)
    .join("\n");

  const capcut = [
    `# CapCut outline — ${card.title}`,
    "Paste into CapCut. Scene changes stay about 3–5 seconds. This is a brief, not an editor.",
    "",
    ...card.capCutSceneOutline.map(
      (scene) =>
        `${scene.order}. ${scene.durationSec}s — ${scene.visual}\n   On screen: ${scene.onScreen}${scene.vo ? `\n   VO: ${scene.vo}` : ""}${scene.brollSlot ? `\n   B-roll: ${scene.brollSlot}` : ""}${scene.sfxOrSound ? `\n   Sound: ${scene.sfxOrSound}` : ""}`,
    ),
    "",
    `Camera: ${card.cameraNotes.primary}. ${card.cameraNotes.notes}`,
    card.cameraNotes.pocket4 ? `Pocket 4: ${card.cameraNotes.pocket4}` : "",
    card.cameraNotes.osmo360 ? `Osmo 360: ${card.cameraNotes.osmo360}` : "",
    card.cameraNotes.micMini ? `Mic Mini: ${card.cameraNotes.micMini}` : "",
    card.cameraNotes.clapSync === false ? "" : "Clap sync before the take.",
    card.soundSuggestion ? `Sound: ${card.soundSuggestion}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const chapters = card.descriptChapters ?? [];
  const descript = [
    `# Descript beats — ${card.title}`,
    "Paste into Descript as chapter titles and scratch VO. Dirty scratch on Mic Mini is fine.",
    "",
    card.hook ? `Hook: ${card.hook}` : "",
    card.spokenKeywordFirstSecond
      ? `Say in the first second: ${card.spokenKeywordFirstSecond}`
      : "",
    ...(card.scriptBeats ?? []).map((beat, index) => `Beat ${index + 1}: ${beat}`),
    ...chapters.map(
      (chapter) =>
        `## ${chapter.title}\n${chapter.vo}${chapter.broll ? `\nB-roll: ${chapter.broll}` : ""}`,
    ),
    "",
    `Outcome CTA (last 2–3s): ${card.softCta}`,
  ]
    .filter(Boolean)
    .join("\n");

  const markdown = [
    `# ${card.title}`,
    "",
    `Pillar: ${card.pillar} · ${card.searchVsTrend} · dyno-safe ${card.dynoSafe ? "yes" : "no"}`,
    "",
    "## Hook",
    card.hook,
    "",
    "## On-screen",
    card.onScreenText,
    "",
    "## Caption pack",
    caption,
    "",
    capcut,
    "",
    descript,
    "",
    "Original Swafford shoot inspired by format. Do not rip footage.",
  ].join("\n");

  return { caption, capcut, descript, markdown };
}

export interface SeedKeyword {
  term: string;
  related: string[];
  intent:
    | "informational"
    | "how_to"
    | "local_shop"
    | "product"
    | "entertainment"
    | "mixed";
  searchVsTrend: "search" | "trend" | "hybrid";
  pillar: string;
  geo: string | null;
  volumeProxy: "high" | "medium" | "low" | "unknown";
}

export const SEED_KEYWORDS: SeedKeyword[] = [
  {
    term: "Harley shop Greenville",
    related: ["Harley repair Greenville SC", "motorcycle shop Upstate SC"],
    intent: "local_shop",
    searchVsTrend: "search",
    pillar: "local_geo",
    geo: "upstate_sc",
    volumeProxy: "medium",
  },
  {
    term: "Asheville motorcycle repair",
    related: ["Harley shop Asheville", "WNC motorcycle shop"],
    intent: "local_shop",
    searchVsTrend: "search",
    pillar: "local_geo",
    geo: "wnc",
    volumeProxy: "medium",
  },
  {
    term: "older Harley repair",
    related: ["Twin Cam repair", "Evo Harley shop"],
    intent: "how_to",
    searchVsTrend: "search",
    pillar: "older_harley_repair",
    geo: null,
    volumeProxy: "high",
  },
  {
    term: "electrical diagnosis Harley",
    related: ["Harley no start", "stator test"],
    intent: "how_to",
    searchVsTrend: "search",
    pillar: "electrical_diagnosis",
    geo: null,
    volumeProxy: "medium",
  },
  {
    term: "Sportster chopper build",
    related: ["Evo chopper", "Harley chopper shop"],
    intent: "how_to",
    searchVsTrend: "search",
    pillar: "sportster_chopper",
    geo: null,
    volumeProxy: "high",
  },
  {
    term: "bagger exhaust",
    related: ["Road Glide exhaust", "touring exhaust sound"],
    intent: "product",
    searchVsTrend: "hybrid",
    pillar: "bagger_exhaust",
    geo: null,
    volumeProxy: "high",
  },
  {
    term: "Road Glide build",
    related: ["bagger build shop"],
    intent: "how_to",
    searchVsTrend: "search",
    pillar: "road_glide_dyna",
    geo: null,
    volumeProxy: "high",
  },
  {
    term: "Dyna build",
    related: ["Dyna Harley shop"],
    intent: "how_to",
    searchVsTrend: "search",
    pillar: "road_glide_dyna",
    geo: null,
    volumeProxy: "medium",
  },
];

export function normalizeHandle(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/tiktok\.com\/@([^/?#]+)/i);
  const raw = (fromUrl?.[1] ?? trimmed).replace(/^@/, "");
  return raw.split(/[/?#]/)[0]?.toLowerCase() ?? "";
}

export function ctaQuality(patterns: string[]): {
  pass: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (patterns.length === 0) {
    issues.push("No CTA patterns stored for this account.");
  }
  for (const pattern of patterns) {
    if (hasEmptyFollowCta(pattern)) {
      issues.push(`Empty CTA: “${pattern}”. Prefer an outcome (book work, performance-ready, local trust).`);
    }
    if (isDynoHeroClaim(pattern)) {
      issues.push(`Dyno hero claim in CTA: “${pattern}”.`);
    }
  }
  return { pass: issues.length === 0, issues };
}
