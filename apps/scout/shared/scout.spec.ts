import { describe, expect, it } from "vitest";

import { keepHit } from "./board.js";
import { mergeBrand } from "./brand.js";
import {
  buildPastePack,
  enforceCard,
  skeletonRecreate,
} from "./guardrails.js";
import {
  classifyTerm,
  competitorCaptionTerms,
  extractProfile,
  extractVideos,
  markOutliers,
  postingHeatmap,
  volumeProxy,
} from "./normalize.js";
import { cacheKey, isFresh, mapProviderFailure } from "./provider.js";
import { DEFAULT_BRAND } from "./brand.js";

const aweme = {
  aweme_id: "123",
  desc: "Harley no start in Greenville #harley",
  create_time: 1_780_329_600,
  share_url: "https://www.tiktok.com/@docharley/video/123",
  author: { unique_id: "docharley", nickname: "Doc Harley" },
  statistics: { play_count: 1000, digg_count: 10, comment_count: 2, share_count: 1 },
  music: { title: "Shop air" },
};

describe("provider", () => {
  it("maps rate limits to the provider phrase", () => {
    expect(mapProviderFailure(429).message).toBe("data provider rate-limited");
    expect(mapProviderFailure(401).errorCode).toBe("scrapecreators_unauthorized");
  });

  it("treats expiry as a timestamp", () => {
    expect(isFresh("2099-01-01T00:00:00.000Z", Date.parse("2026-01-01T00:00:00.000Z"))).toBe(
      true,
    );
    expect(isFresh("2020-01-01T00:00:00.000Z")).toBe(false);
    expect(cacheKey("keyword", " Harley ", "us")).toBe("keyword:US:harley");
  });
});

describe("normalize", () => {
  it("unwraps search items and marks outliers only with four scored videos", () => {
    const videos = extractVideos(
      {
        search_item_list: [
          { aweme_info: aweme },
          { aweme_info: { ...aweme, aweme_id: "2", statistics: { play_count: 10 } } },
          { aweme_info: { ...aweme, aweme_id: "3", statistics: { play_count: 12 } } },
          { aweme_info: { ...aweme, aweme_id: "4", statistics: { play_count: 11 } } },
        ],
      },
      "search",
    );
    expect(videos).toHaveLength(4);
    expect(videos[0]?.geo).toBe("upstate_sc");
    expect(videos[0]?.dynoSafe).toBe(true);
    const marked = markOutliers(videos);
    expect(marked.find((video) => video.id === "123")?.outlier).toBe(true);
    expect(volumeProxy(videos).note).toMatch(/Not Google Ads/);
  });

  it("reads a profile and classifies a flash", () => {
    const profile = extractProfile({
      user: { uniqueId: "Kruesi", nickname: "Kruesi Originals" },
      stats: { followerCount: 10, heartCount: 100, videoCount: 4 },
    });
    expect(profile?.handle).toBe("kruesi");
    const now = Date.parse("2026-10-07T12:00:00.000Z");
    const term = classifyTerm(
      "bagger",
      [
        {
          ...extractVideos({ aweme_list: [aweme] }, "trend")[0]!,
          postedAt: "2026-10-07T10:00:00.000Z",
        },
      ],
      now,
    );
    expect(term.classification).toBe("flash_24_72h");
  });

  it("seeds trend labels from competitor hashtags and repeated caption words", () => {
    const base = extractVideos({ aweme_list: [aweme] }, "trend")[0]!;
    const pump = {
      ...base,
      id: "pump",
      caption: "Water pump fail on the Road Glide #waterpump #fyp",
      hashtags: ["waterpump", "fyp"],
    };
    const exhaustA = {
      ...base,
      id: "ex-a",
      caption: "Bagger exhaust note in the bay",
      hashtags: [],
    };
    const exhaustB = {
      ...base,
      id: "ex-b",
      caption: "Another bagger exhaust cold open",
      hashtags: [],
    };
    const terms = competitorCaptionTerms([pump, exhaustA, exhaustB]);
    expect(terms.map((term) => term.label)).toContain("#waterpump");
    expect(terms.map((term) => term.label)).not.toContain("#fyp");
    expect(terms.map((term) => term.label)).toContain("exhaust");
    expect(competitorCaptionTerms([])).toEqual([]);
  });

  it("counts posting hours in Eastern time", () => {
    const video = extractVideos({ aweme_list: [aweme] }, "hybrid")[0]!;
    const videos = Array.from({ length: 8 }, (_, index) => ({
      ...video,
      id: String(index),
      postedAt: "2026-06-01T16:00:00.000Z",
    }));
    const heat = postingHeatmap(videos, "Reply in the first hour.");
    expect(heat.timezone).toBe("America/New_York");
    expect(heat.recommended[0]?.dayOfWeek).toBe("mon");
    expect(heat.recommended[0]?.localTime).toBe("12:00");
    expect(heat.grid[1]?.[4]).toBe(8);
    expect(heat.firstHourReply).toMatch(/first hour/);
  });
});

describe("guardrails", () => {
  it("scrubs dyno claims and builds a paste pack", () => {
    const card = enforceCard(
      skeletonRecreate({
        brand: DEFAULT_BRAND,
        caption: "Put it on the dyno and follow for more",
        handle: "bertsharley",
        url: "https://www.tiktok.com/@bertsharley/video/1",
        soundName: "Exhaust bed",
        searchVsTrend: "search",
        geo: "upstate_sc",
      }),
      DEFAULT_BRAND,
    );
    expect(card.dynoSafe).toBe(true);
    expect(card.hook.toLowerCase()).not.toMatch(/dyno/);
    expect(card.originalShoot).toBe(true);
    expect(card.capCutSceneOutline.every((scene) => scene.durationSec >= 3 && scene.durationSec <= 5)).toBe(
      true,
    );
    const pack = buildPastePack(card);
    expect(pack.capcut).toMatch(/CapCut/);
    expect(pack.descript).toMatch(/Descript/);
    expect(pack.caption).toMatch(/swaffordspeed.com/);
  });
});

describe("brand", () => {
  it("keeps seeds when a saved brand is partial and locks dyno unless explicitly true", () => {
    const merged = mergeBrand({ displayName: "Other Shop", dynoUnlocked: false, watchlist: [] });
    expect(merged.displayName).toBe("Other Shop");
    expect(merged.watchlist.map((item) => item.handle)).toContain("mickeycohenmotorsports");
    expect(merged.watchlist.filter((item) => item.role === "local").map((item) => item.handle)).toEqual(
      expect.arrayContaining(["rev_moto_nc", "that_z900_dude"]),
    );
    expect(merged.dynoUnlocked).toBe(false);
    expect(mergeBrand({ dynoUnlocked: true }).dynoUnlocked).toBe(true);
    expect(merged.recreateRule).toBe("original_shoot");
  });

  it("filters dyno-unsafe hits", () => {
    expect(
      keepHit(
        { searchVsTrend: "search", geo: "wnc", dynoSafe: false },
        { searchVsTrend: "all", geo: "all", dyno: "safe" },
      ),
    ).toBe(false);
  });
});
