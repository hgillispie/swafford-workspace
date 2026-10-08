import { describe, expect, it } from "vitest";

import {
  emptyFilterHint,
  homeState,
  intentLabel,
  noResultsText,
  outlierText,
  termTimingText,
  watchStatusText,
} from "./guidance.js";

const empty = {
  configured: true,
  breakouts: [],
  terms: [],
  watchlist: [{ fetched: false }, { fetched: false, missed: false }],
  intelligence: null,
};

describe("homeState", () => {
  it("sends a first visit with a key to the first pulse", () => {
    expect(homeState(empty)).toBe("first_run");
    expect(homeState({ ...empty, watchlist: [] })).toBe("first_run");
  });

  it("sends a first visit without a key to Settings", () => {
    expect(homeState({ ...empty, configured: false })).toBe("needs_key");
  });

  it("steps aside once there is anything to read", () => {
    expect(homeState({ ...empty, breakouts: [{}] })).toBe("ready");
    expect(homeState({ ...empty, terms: [{}] })).toBe("ready");
    expect(homeState({ ...empty, intelligence: { id: "x" } })).toBe("ready");
    expect(
      homeState({
        ...empty,
        watchlist: [{ fetched: true }, { fetched: false }],
      }),
    ).toBe("ready");
  });

  it("still shows saved results when the key is gone", () => {
    expect(homeState({ ...empty, configured: false, breakouts: [{}] })).toBe(
      "ready",
    );
  });
});

describe("plain-language copy", () => {
  it("says what a multiple means without calling it a median", () => {
    expect(outlierText(3.2)).toBe("3.2× its usual views");
    expect(outlierText(null)).toBe("");
  });

  it("turns a half-life into days a person can plan around", () => {
    expect(termTimingText("flash_24_72h", 2)).toBe(
      "Spiking now · fades in about 2 days",
    );
    expect(termTimingText("mega_trend", 14)).toBe(
      "Steady trend · fades in about 14 days",
    );
    expect(termTimingText("topic", 0.4)).toBe("Topic · fades in about 1 day");
  });

  it("describes a watched account in everyday words", () => {
    const fmt = (value: number | null) => (value == null ? "—" : String(value));
    const row = { fetched: false, followers: null, outlierCount: 0 };
    expect(watchStatusText(row, false, fmt)).toBe("not checked yet");
    expect(watchStatusText(row, true, fmt)).toBe("checking now…");
    expect(watchStatusText({ ...row, missed: true }, false, fmt)).toBe(
      "no public account found",
    );
    expect(
      watchStatusText(
        { fetched: true, followers: 1200, outlierCount: 1 },
        false,
        fmt,
      ),
    ).toBe("1200 followers · 1 breakout");
  });

  it("labels keyword intent", () => {
    expect(intentLabel("local_shop")).toBe("Local shop");
    expect(intentLabel("mixed")).toBe("General");
  });
});

describe("empty results", () => {
  it("names what is narrowing the list and whether clearing helps", () => {
    expect(
      emptyFilterHint({ searchVsTrend: "all", geo: "all", dyno: "all" }),
    ).toBeNull();
    expect(
      emptyFilterHint({ searchVsTrend: "all", geo: "all", dyno: "safe" }),
    ).toEqual({
      text: "Nothing matches Dyno-safe only. Choose Include dyno claims to see everything.",
      canClear: false,
    });
    expect(
      emptyFilterHint({ searchVsTrend: "trend", geo: "wnc", dyno: "all" }),
    ).toEqual({
      text: "Nothing matches one place + one type.",
      canClear: true,
    });
  });

  it("suggests a next try for a keyword and for a hashtag", () => {
    expect(noResultsText(" harley shop ")).toMatch(
      /“harley shop”.*fewer words/,
    );
    expect(noResultsText("#bagger")).toMatch(/#bagger.*shorter hashtag/);
  });
});
