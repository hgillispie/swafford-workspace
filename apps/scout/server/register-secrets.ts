import { registerRequiredSecret } from "@agent-native/core/secrets";

import { SCRAPECREATORS_KEY, SCRAPECREATORS_ORIGIN } from "../shared/provider.js";

registerRequiredSecret({
  key: SCRAPECREATORS_KEY,
  label: "ScrapeCreators API key",
  description:
    "Live TikTok search, profiles, and the trending feed. Store it in the Dispatch vault. A deploy env var with the same name is also read when the vault is empty.",
  scope: "workspace",
  kind: "api-key",
  required: false,
  docsUrl: "https://docs.scrapecreators.com",
  usedFor: [
    {
      appId: "scout",
      feature: "TikTok keyword, competitor, trend, and audit lookups",
      effectWhenRemoved: "Scout keeps showing cached rows and asks for the key before a new fetch.",
    },
  ],
  validator: async (value) => {
    try {
      const response = await fetch(`${SCRAPECREATORS_ORIGIN}/v1/credit-balance`, {
        headers: { "x-api-key": value },
      });
      if (response.ok) return { ok: true };
      if (response.status === 401) {
        return { ok: false, error: "ScrapeCreators rejected this key." };
      }
      if (response.status === 429) {
        return { ok: false, retryable: true, error: "data provider rate-limited" };
      }
      return { ok: false, retryable: true, error: "data provider request failed" };
    } catch {
      return { ok: false, retryable: true, error: "data provider request failed" };
    }
  },
});
