import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { saveRecreate } from "../server/lib/live.js";
import { GROWTH_TAGS } from "../shared/guardrails.js";

const scene = z.object({
  order: z.number().int(),
  durationSec: z.number().describe("Scene length in seconds; Scout clamps this to 3–5"),
  visual: z.string().max(200),
  onScreen: z.string().max(80),
  vo: z.string().max(200).nullable(),
});

export default defineAction({
  description:
    "Save a rewritten original-shoot recreate. Enforces dyno-safe copy, soft CTA, 3–5s scenes, and growth tags. Use the strongest configured model for the rewrite, not a mini, flash, or haiku default.",
  schema: z.object({
    id: z.string().describe("Recreate id from scout-recreate"),
    title: z.string().trim().min(1).max(120),
    hook: z.string().trim().min(1).max(400),
    onScreenText: z.string().max(80),
    spokenKeywordFirstSecond: z.string().max(80),
    captionLine1: z.string().max(120),
    captionBody: z.string().max(500).nullable().optional(),
    hashtags: z.array(z.string().max(40)).max(12),
    inviteKeywordComment: z.string().max(160).nullable().optional(),
    scriptBeats: z.array(z.string().max(240)).max(8),
    capCutSceneOutline: z.array(scene).max(8),
    descriptChapters: z
      .array(
        z.object({
          title: z.string().max(80),
          vo: z.string().max(300),
          broll: z.string().max(200).nullable(),
        }),
      )
      .max(8),
    softCta: z.string().max(200).optional(),
    searchVsTrend: z.enum(["search", "trend", "hybrid"]),
    geo: z.string().max(40).nullable().optional(),
    pillar: z.string().max(40).optional(),
    soundSuggestion: z.string().max(200).nullable().optional(),
    growthPrincipleTags: z.array(z.enum(GROWTH_TAGS)).optional(),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const actor = await requireMember();
    if (input.capCutSceneOutline.length === 0) {
      fail("A recreate needs at least one CapCut scene.", {
        statusCode: 400,
        errorCode: "invalid_recreate",
      });
    }
    return saveRecreate(actor, input.id, {
      title: input.title,
      hook: input.hook,
      onScreenText: input.onScreenText,
      spokenKeywordFirstSecond: input.spokenKeywordFirstSecond,
      captionLine1: input.captionLine1,
      captionBody: input.captionBody ?? null,
      hashtags: input.hashtags,
      inviteKeywordComment: input.inviteKeywordComment ?? null,
      scriptBeats: input.scriptBeats,
      capCutSceneOutline: input.capCutSceneOutline,
      descriptChapters: input.descriptChapters,
      searchVsTrend: input.searchVsTrend,
      geo: input.geo ?? null,
      soundSuggestion: input.soundSuggestion ?? null,
      ...(input.softCta ? { softCta: input.softCta } : {}),
      ...(input.pillar ? { pillar: input.pillar } : {}),
      ...(input.growthPrincipleTags
        ? { growthPrincipleTags: input.growthPrincipleTags }
        : {}),
    });
  },
});
