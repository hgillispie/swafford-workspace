import type { Geo, SearchVsTrend } from "./brand.js";

export interface BoardFilters {
  searchVsTrend: "all" | SearchVsTrend;
  geo: "all" | Geo;
  dyno: "all" | "safe";
}

/** Reload guard so a cold Niche pulse auto-fetches once, then waits. */
export const PULSE_SEED_COOLDOWN_MS = 30 * 60 * 1000;

export const PULSE_SEED_STORAGE_KEY = "scout-pulse-autoseed-at";

export interface PulseSeedBoard {
  configured: boolean;
  breakouts: readonly unknown[];
  terms: readonly unknown[];
  watchlist: readonly { fetched: boolean; missed?: boolean }[];
  intelligence: unknown | null;
}

/**
 * True when a signed-in board is safe to auto-run `scout-intelligence-report`.
 * Requires the ScrapeCreators key. Fires when every watchlist row is unfetched,
 * or when breakouts, terms, and the intelligence packet are all missing.
 * A single fetched competitor or an existing packet skips the run.
 */
export function pulseNeedsLiveSeed(board: PulseSeedBoard): boolean {
  if (!board.configured) return false;
  const open = board.watchlist.filter((row) => !row.fetched && !row.missed);
  const allOpen = board.watchlist.length > 0 && open.length === board.watchlist.length;
  const emptyBoard =
    board.breakouts.length === 0 &&
    board.terms.length === 0 &&
    board.intelligence == null &&
    board.watchlist.every((row) => !row.fetched);
  return allOpen || emptyBoard;
}

export function pulseSeedAllowed(
  lastAt: number | null,
  now: number,
  cooldown = PULSE_SEED_COOLDOWN_MS,
): boolean {
  if (lastAt == null || !Number.isFinite(lastAt)) return true;
  return now - lastAt >= cooldown;
}

export function keepHit(
  hit: { searchVsTrend: SearchVsTrend; geo: Geo | null; dynoSafe: boolean },
  filters: BoardFilters,
): boolean {
  if (filters.dyno === "safe" && !hit.dynoSafe) return false;
  if (filters.searchVsTrend !== "all" && hit.searchVsTrend !== filters.searchVsTrend) {
    return false;
  }
  if (filters.geo === "national") return hit.geo == null || hit.geo === "national";
  if (filters.geo !== "all" && hit.geo !== filters.geo) return false;
  return true;
}
