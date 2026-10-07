import type { BrandConfig } from "./brand.js";

export const HERO_CLAIM =
  /\b(dyno(?:'d|ed)|put it on the dyno|dyno\s*(?:tune|tuning|tuned|sheet|numbers|hero|queen|pull|run|graph)s?)\b/i;

export const FOLLOW_FOR_MORE = /\bfollow for more\b/i;

export const GROWTH_TAGS = [
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
] as const;

export type GrowthTag = (typeof GROWTH_TAGS)[number];

export const FOLLOWER_LIKE_TARGET_PCT = 15;

export function isDynoHeroClaim(text: string): boolean {
  return HERO_CLAIM.test(text);
}

export function hasEmptyFollowCta(text: string): boolean {
  return FOLLOW_FOR_MORE.test(text);
}

export function scrubCopy(text: string, unlocked: boolean, softCta: string): string {
  let next = text;
  if (hasEmptyFollowCta(next)) next = softCta;
  if (!unlocked && isDynoHeroClaim(next)) {
    next = next.replace(HERO_CLAIM, "performance work");
  }
  return next;
}

export function followerLikeHealth(
  followers: number | null,
  likes: number | null,
): { pct: number | null; belowTarget: boolean } {
  if (followers == null || likes == null || likes <= 0) {
    return { pct: null, belowTarget: false };
  }
  const pct = Math.round((followers / likes) * 1000) / 10;
  return { pct, belowTarget: pct < FOLLOWER_LIKE_TARGET_PCT };
}

export interface Scene {
  order: number;
  durationSec: number;
  visual: string;
  onScreen: string;
  vo: string | null;
}

export interface RecreateCard {
  title: string;
  hook: string;
  onScreenText: string;
  spokenKeywordFirstSecond: string;
  captionLine1: string;
  captionBody: string | null;
  hashtags: string[];
  inviteKeywordComment: string | null;
  scriptBeats: string[];
  capCutSceneOutline: Scene[];
  descriptChapters: { title: string; vo: string; broll: string | null }[];
  cameraNotes: {
    primary: "pocket4" | "osmo360" | "both" | "phone_backup";
    pocket4: string;
    osmo360: string;
    micMini: string;
    clapSync: boolean;
    notes: string;
  };
  soundSuggestion: string | null;
  dynoSafe: boolean;
  pillar: string;
  searchVsTrend: "search" | "trend" | "hybrid";
  geo: string | null;
  assignee: "matt" | "hunter" | "either";
  softCta: string;
  growthPrincipleTags: GrowthTag[];
  inspiredByUrl: string | null;
  inspiredByHandle: string | null;
  originalShoot: true;
}

export interface PastePack {
  caption: string;
  capcut: string;
  descript: string;
  markdown: string;
}

function hashTag(tag: string): string {
  const clean = tag.replace(/^#/, "").replace(/[^\w]/g, "");
  return clean ? `#${clean}` : "";
}

export function buildPastePack(card: RecreateCard): PastePack {
  const tags = card.hashtags.map(hashTag).filter(Boolean).join(" ");
  const caption = [
    card.captionLine1,
    card.captionBody ?? "",
    tags,
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
        `${scene.order}. ${scene.durationSec}s — ${scene.visual}\n   On screen: ${scene.onScreen}${scene.vo ? `\n   VO: ${scene.vo}` : ""}`,
    ),
    "",
    `Camera: ${card.cameraNotes.primary}. ${card.cameraNotes.notes}`,
    `Pocket 4: ${card.cameraNotes.pocket4}`,
    `Osmo 360: ${card.cameraNotes.osmo360}`,
    `Mic Mini: ${card.cameraNotes.micMini}`,
    "Clap sync before the take.",
  ].join("\n");

  const descript = [
    `# Descript beats — ${card.title}`,
    "Paste into Descript as chapter titles and scratch VO. Dirty scratch on Mic Mini is fine.",
    "",
    `Hook: ${card.hook}`,
    `Say in the first second: ${card.spokenKeywordFirstSecond}`,
    ...card.scriptBeats.map((beat, index) => `Beat ${index + 1}: ${beat}`),
    ...card.descriptChapters.map(
      (chapter) =>
        `## ${chapter.title}\n${chapter.vo}${chapter.broll ? `\nB-roll: ${chapter.broll}` : ""}`,
    ),
    "",
    `Outcome CTA (last 2–3s): ${card.softCta}`,
  ].join("\n");

  const markdown = [
    `# ${card.title}`,
    "",
    `${card.searchVsTrend} · dyno-safe ${card.dynoSafe ? "yes" : "no"} · original shoot`,
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
    "Original shoot inspired by format. Do not rip footage.",
  ].join("\n");

  return { caption, capcut, descript, markdown };
}

export function topicFromCaption(caption: string): string {
  const stripped = caption.replace(/#[\w]+/g, " ").replace(/\s+/g, " ").trim();
  return stripped.slice(0, 80) || "shop job";
}

export function skeletonRecreate(input: {
  brand: BrandConfig;
  caption: string;
  handle: string | null;
  url: string | null;
  soundName: string | null;
  searchVsTrend: "search" | "trend" | "hybrid";
  geo: string | null;
}): RecreateCard {
  const unlocked = input.brand.dynoUnlocked === true;
  const topic = scrubCopy(topicFromCaption(input.caption), unlocked, input.brand.softCta);
  const keyword = topic.split(" ").slice(0, 4).join(" ");
  const hashtags = [
    ...input.brand.localHashtags,
    "#HarleyRepair",
    "#MotorcycleShop",
  ]
    .map(hashTag)
    .filter(Boolean)
    .slice(0, 6);
  const scenes: Scene[] = [
    {
      order: 1,
      durationSec: 3,
      visual: "Cold open on the bike or the failed part",
      onScreen: keyword,
      vo: keyword,
    },
    {
      order: 2,
      durationSec: 4,
      visual: "Show the diagnosis or the teardown",
      onScreen: "What we found",
      vo: null,
    },
    {
      order: 3,
      durationSec: 4,
      visual: "The fix, in the bay, original footage",
      onScreen: "The fix",
      vo: null,
    },
    {
      order: 4,
      durationSec: 3,
      visual: "Outcome, then the booking line",
      onScreen: input.brand.displayName,
      vo: input.brand.softCta,
    },
  ];
  return {
    title: topic.slice(0, 80),
    hook: scrubCopy(
      `Original shoot — ${topic}. Rewrite this hook in shop voice before filming.`,
      unlocked,
      input.brand.softCta,
    ),
    onScreenText: keyword,
    spokenKeywordFirstSecond: keyword,
    captionLine1: keyword,
    captionBody: null,
    hashtags,
    inviteKeywordComment: `Comment ${keyword.split(" ")[0] || "SHOP"} and we'll point you at the next step.`,
    scriptBeats: [
      `Name the bike and the problem: ${topic}`,
      "Show the check, not a montage of someone else's video.",
      `Close on the outcome and ${input.brand.softCta}`,
    ],
    capCutSceneOutline: scenes,
    descriptChapters: scenes.map((scene) => ({
      title: scene.onScreen,
      vo: scene.vo ?? scene.visual,
      broll: scene.visual,
    })),
    cameraNotes: {
      primary: "both",
      pocket4: "A-cam, tight on hands and the part",
      osmo360: "Bay context, not the hero angle",
      micMini: "Scratch VO. Clap sync.",
      clapSync: true,
      notes: "Original shoot. Do not rip the reference video.",
    },
    soundSuggestion: input.soundName
      ? `Reference used “${input.soundName}”. Pick a bed that does not bury exhaust.`
      : null,
    dynoSafe: true,
    pillar: "other",
    searchVsTrend: input.searchVsTrend,
    geo: input.geo,
    assignee: "matt",
    softCta: input.brand.softCta,
    growthPrincipleTags: [...GROWTH_TAGS],
    inspiredByUrl: input.url,
    inspiredByHandle: input.handle,
    originalShoot: true,
  };
}

export function draftBody(
  kind: "hook" | "script" | "caption",
  card: RecreateCard,
): string {
  if (kind === "hook") return card.hook;
  if (kind === "script") {
    return [card.spokenKeywordFirstSecond, ...card.scriptBeats, card.softCta].join("\n");
  }
  return buildPastePack(card).caption;
}

export function enforceCard(card: RecreateCard, brand: BrandConfig): RecreateCard {
  const unlocked = brand.dynoUnlocked === true;
  const scrub = (value: string) => scrubCopy(value, unlocked, brand.softCta);
  return {
    ...card,
    dynoSafe: unlocked ? card.dynoSafe : true,
    hook: scrub(card.hook),
    onScreenText: scrub(card.onScreenText),
    spokenKeywordFirstSecond: scrub(card.spokenKeywordFirstSecond),
    captionLine1: scrub(card.captionLine1),
    captionBody: card.captionBody == null ? null : scrub(card.captionBody),
    softCta: scrub(card.softCta) || brand.softCta,
    inviteKeywordComment:
      card.inviteKeywordComment == null ? null : scrub(card.inviteKeywordComment),
    scriptBeats: card.scriptBeats.map(scrub),
    originalShoot: true,
    growthPrincipleTags: card.growthPrincipleTags.length
      ? card.growthPrincipleTags
      : [...GROWTH_TAGS],
  };
}
