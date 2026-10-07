export const SCRAPECREATORS_KEY = "SCRAPECREATORS_API_KEY";
export const SCRAPECREATORS_ORIGIN = "https://api.scrapecreators.com";

export const TTL_MS = {
  keyword: 6 * 60 * 60 * 1000,
  hashtag: 6 * 60 * 60 * 1000,
  profile: 24 * 60 * 60 * 1000,
  "profile-videos": 6 * 60 * 60 * 1000,
  trending: 3 * 60 * 60 * 1000,
  users: 12 * 60 * 60 * 1000,
} as const;

export type CacheKind = keyof typeof TTL_MS;

export function cacheKey(kind: string, query: string, region = "US"): string {
  return `${kind}:${region.toUpperCase()}:${query.trim().toLowerCase()}`;
}

export function isFresh(expiresAt: string, now = Date.now()): boolean {
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires > now;
}

export interface ProviderFailure {
  message: string;
  errorCode: string;
  statusCode: number;
}

export function mapProviderFailure(status: number): ProviderFailure {
  if (status === 401) {
    return {
      message: "ScrapeCreators rejected SCRAPECREATORS_API_KEY.",
      errorCode: "scrapecreators_unauthorized",
      statusCode: 401,
    };
  }
  if (status === 402) {
    return {
      message: "ScrapeCreators has no credits left.",
      errorCode: "scrapecreators_credits",
      statusCode: 402,
    };
  }
  if (status === 429) {
    return {
      message: "data provider rate-limited",
      errorCode: "provider_rate_limited",
      statusCode: 429,
    };
  }
  if (status === 404) {
    return {
      message: "ScrapeCreators could not find that public record.",
      errorCode: "not_found",
      statusCode: 404,
    };
  }
  return {
    message: "data provider request failed",
    errorCode: "provider_failed",
    statusCode: status >= 400 && status < 600 ? status : 502,
  };
}

export const MISSING_KEY_MESSAGE =
  "SCRAPECREATORS_API_KEY is not set. Add it in Settings or as a deploy env var.";
