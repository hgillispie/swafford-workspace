import { fail, isActionContractError } from "@agent-native/core/action";

import {
  SCRAPECREATORS_ORIGIN,
  mapProviderFailure,
} from "../../shared/provider.js";

export async function scGet(
  path: string,
  query: Record<string, string | undefined>,
  apiKey: string,
): Promise<unknown> {
  const url = new URL(path, SCRAPECREATORS_ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (isActionContractError(error)) throw error;
    fail("data provider request failed", {
      statusCode: 502,
      errorCode: "provider_failed",
    });
  }
  if (!response.ok) {
    const mapped = mapProviderFailure(response.status);
    fail(mapped.message, {
      statusCode: mapped.statusCode,
      errorCode: mapped.errorCode,
    });
  }
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    fail("data provider request failed", {
      statusCode: 502,
      errorCode: "provider_failed",
    });
  }
}

export function searchKeyword(
  apiKey: string,
  input: { query: string; region: string; datePosted?: string },
) {
  return scGet(
    "/v1/tiktok/search/keyword",
    {
      query: input.query,
      region: input.region,
      date_posted: input.datePosted,
    },
    apiKey,
  );
}

export function searchHashtag(apiKey: string, input: { hashtag: string; region: string }) {
  return scGet(
    "/v1/tiktok/search/hashtag",
    { hashtag: input.hashtag.replace(/^#/, ""), region: input.region },
    apiKey,
  );
}

export function fetchProfile(apiKey: string, handle: string) {
  return scGet("/v1/tiktok/profile", { handle }, apiKey);
}

export function fetchProfileVideos(apiKey: string, handle: string, region = "US") {
  return scGet("/v3/tiktok/profile/videos", { handle, region }, apiKey);
}

export function fetchTrending(apiKey: string) {
  return scGet("/v1/tiktok/get-trending-feed", {}, apiKey);
}
