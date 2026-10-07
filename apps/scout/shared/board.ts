import type { Geo, SearchVsTrend } from "./brand.js";

export interface BoardFilters {
  searchVsTrend: "all" | SearchVsTrend;
  geo: "all" | Geo;
  dyno: "all" | "safe";
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
