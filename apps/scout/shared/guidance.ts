/**
 * Plain-language state and copy for Scout's screens. Pure so the rules that
 * decide what a first-time visitor sees can be tested without a browser.
 */
import type { Geo, SearchVsTrend } from "./brand.js";

export interface GuidanceBoard {
  configured: boolean;
  breakouts: readonly unknown[];
  terms: readonly unknown[];
  watchlist: readonly { fetched: boolean; missed?: boolean }[];
  intelligence: unknown | null;
}

/**
 * - `needs_key`: nothing stored and no live key, so the only next step is Settings.
 * - `first_run`: key set, nothing stored yet, so the only next step is the first pulse.
 * - `ready`: there is something to read. Guidance steps aside.
 */
export type HomeState = "needs_key" | "first_run" | "ready";

export function homeState(board: GuidanceBoard): HomeState {
  const nothingStored =
    board.breakouts.length === 0 &&
    board.terms.length === 0 &&
    board.intelligence == null &&
    board.watchlist.every((row) => !row.fetched);
  if (!nothingStored) return "ready";
  return board.configured ? "first_run" : "needs_key";
}

export const SEARCH_TYPE_OPTIONS = [
  ["all", "Search and trend"],
  ["search", "Search-driven"],
  ["trend", "Trend-driven"],
  ["hybrid", "Both"],
] as const satisfies readonly ["all" | SearchVsTrend, string][];

export const PLACE_OPTIONS = [
  ["all", "All places"],
  ["upstate_sc", "Upstate SC"],
  ["wnc", "Western NC"],
  ["east_tn", "East TN"],
  ["national", "National"],
] as const satisfies readonly ["all" | Geo, string][];

export const CLAIM_OPTIONS = [
  ["safe", "Dyno-safe only"],
  ["all", "Include dyno claims"],
] as const;

/** Views against the account's usual views. Never a promise of reach. */
export function outlierText(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "";
  return `${score}× its usual views`;
}

export function termTimingText(
  classification: string,
  halfLifeDays: number,
): string {
  const kind =
    classification === "flash_24_72h"
      ? "Spiking now"
      : classification === "mega_trend"
        ? "Steady trend"
        : "Topic";
  const days = Math.max(1, Math.round(halfLifeDays));
  return `${kind} · fades in about ${days} ${days === 1 ? "day" : "days"}`;
}

export function watchStatusText(
  row: {
    fetched: boolean;
    missed?: boolean;
    followers: number | null;
    outlierCount: number;
  },
  watching: boolean,
  formatFollowers: (value: number | null) => string,
): string {
  const base = watching
    ? "checking now…"
    : row.fetched
      ? `${formatFollowers(row.followers)} followers`
      : row.missed
        ? "no public account found"
        : "not checked yet";
  return row.outlierCount > 0
    ? `${base} · ${row.outlierCount} ${row.outlierCount === 1 ? "breakout" : "breakouts"}`
    : base;
}

/** Why a filtered list came up empty, so the next step is clear. */
export function emptyFilterHint(filters: {
  searchVsTrend: "all" | SearchVsTrend;
  geo: "all" | Geo;
  dyno: "all" | "safe";
}): { text: string; canClear: boolean } | null {
  const narrowing: string[] = [];
  if (filters.dyno === "safe") narrowing.push("Dyno-safe only");
  if (filters.geo !== "all") narrowing.push("one place");
  if (filters.searchVsTrend !== "all") narrowing.push("one type");
  if (narrowing.length === 0) return null;
  return {
    text: `Nothing matches ${narrowing.join(" + ")}.${
      filters.dyno === "safe"
        ? " Choose Include dyno claims to see everything."
        : ""
    }`,
    canClear: filters.geo !== "all" || filters.searchVsTrend !== "all",
  };
}

export function intentLabel(intent: string): string {
  switch (intent) {
    case "how_to":
      return "How-to";
    case "local_shop":
      return "Local shop";
    case "product":
      return "Product";
    case "informational":
      return "Question";
    case "entertainment":
      return "Entertainment";
    default:
      return "General";
  }
}

export function noResultsText(query: string): string {
  const term = query.trim();
  return term.startsWith("#")
    ? `No videos found for ${term}. Try a shorter hashtag or a plain phrase.`
    : `No videos found for “${term}”. Try fewer words, a nearby town, or a #hashtag.`;
}
