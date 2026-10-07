export const GEOS = ["upstate_sc", "wnc", "east_tn", "national"] as const;
export type Geo = (typeof GEOS)[number];

export const SEARCH_VS_TREND = ["search", "trend", "hybrid"] as const;
export type SearchVsTrend = (typeof SEARCH_VS_TREND)[number];

export interface WatchSeed {
  handle: string;
  displayName: string;
  role: "north_star" | "local" | "watch";
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
  searchVsTrend: SearchVsTrend;
  pillar: string;
  geo: Geo | null;
  volumeProxy: "very_high" | "high" | "medium" | "low" | "unknown";
}

export interface BrandConfig {
  displayName: string;
  handle: string;
  site: string;
  phone: string;
  softCta: string;
  niche: string;
  timezone: "America/New_York";
  geos: Geo[];
  localHashtags: string[];
  dynoUnlocked: boolean;
  recreateRule: "original_shoot";
  firstHourReply: string;
  voiceName: string;
  voiceNotes: string;
  watchlist: WatchSeed[];
  seedKeywords: SeedKeyword[];
}

/**
 * Swafford Speed is the seeded default so a fresh workspace is usable.
 * `scout-set-brand` replaces any field. Rebranding does not require a fork.
 */
export const DEFAULT_BRAND: BrandConfig = {
  displayName: "Swafford Speed",
  handle: "swaffordspeed",
  site: "swaffordspeed.com",
  phone: "864-666-9451",
  softCta: "Book performance work — swaffordspeed.com · 864-666-9451",
  niche: "Harley performance, electrical diagnosis, and older Harley repair",
  timezone: "America/New_York",
  geos: ["upstate_sc", "wnc", "east_tn"],
  localHashtags: ["#Greenville", "#UpstateSC", "#Asheville"],
  dynoUnlocked: false,
  recreateRule: "original_shoot",
  firstHourReply: "Reply to comments in the first hour after posting.",
  voiceName: "Shop voice",
  voiceNotes:
    "Plain shop language. Name the bike and the job. Outcome CTA. No hype, no ripped footage, no empty follow-for-more.",
  watchlist: [
    {
      handle: "mickeycohenmotorsports",
      displayName: "Mickey Cohen Motorsports",
      role: "north_star",
    },
    { handle: "bertsharley", displayName: "BertsHarley", role: "north_star" },
    { handle: "docharley", displayName: "Doc Harley", role: "north_star" },
    { handle: "kruesi", displayName: "Kruesi Originals", role: "north_star" },
    // Regional accounts from the Oct 5 pulse fixture. Upstate SC's local list
    // was empty; that_z900_dude is the documented Upstate up-and-comer.
    { handle: "rev_moto_nc", displayName: "Rev Moto NC", role: "local" },
    { handle: "that_z900_dude", displayName: "That Z900 Dude", role: "local" },
  ],
  seedKeywords: [
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
      term: "bagger exhaust",
      related: ["Road Glide exhaust", "touring exhaust sound"],
      intent: "product",
      searchVsTrend: "hybrid",
      pillar: "bagger_exhaust",
      geo: null,
      volumeProxy: "high",
    },
  ],
};

export function mergeBrand(saved: Partial<BrandConfig> | null | undefined): BrandConfig {
  if (!saved) return { ...DEFAULT_BRAND, watchlist: [...DEFAULT_BRAND.watchlist], seedKeywords: [...DEFAULT_BRAND.seedKeywords] };
  return {
    ...DEFAULT_BRAND,
    ...saved,
    geos: saved.geos?.length ? saved.geos : DEFAULT_BRAND.geos,
    localHashtags: saved.localHashtags?.length
      ? saved.localHashtags
      : DEFAULT_BRAND.localHashtags,
    watchlist: saved.watchlist?.length ? saved.watchlist : DEFAULT_BRAND.watchlist,
    seedKeywords: saved.seedKeywords?.length
      ? saved.seedKeywords
      : DEFAULT_BRAND.seedKeywords,
    timezone: "America/New_York",
    recreateRule: "original_shoot",
    dynoUnlocked: saved.dynoUnlocked === true,
  };
}
