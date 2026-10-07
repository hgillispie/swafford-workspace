import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildPastePack,
  ctaQuality,
  effectiveDynoUnlocked,
  enforceCard,
  hasEmptyFollowCta,
  isDynoHeroClaim,
  normalizeHandle,
  SOFT_CTA,
} from "./pulse-guardrails.js";
import { parsePulseIngest, type PulseRecreateCard } from "./pulse-schema.js";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/pulse-2026-10-05-tiktok.json",
);

describe("pulse ingest fixture", () => {
  it("parses the Oct 5 fixture with two cards", () => {
    const payload = parsePulseIngest(
      JSON.parse(readFileSync(fixturePath, "utf8")),
    );
    expect(payload.schemaVersion).toBe("1.0");
    expect(payload.recreateCards).toHaveLength(2);
    expect(payload.idempotencyKey).toBe("2026-10-05:tiktok");
  });
});

describe("dyno guardrails", () => {
  const card = parsePulseIngest(
    JSON.parse(readFileSync(fixturePath, "utf8")),
  ).recreateCards[0] as PulseRecreateCard;

  it("keeps the approved dyno-room hook", () => {
    expect(isDynoHeroClaim(card.hook)).toBe(false);
    expect(enforceCard(card, false).hook).toContain("dyno room");
  });

  it("rewrites hero claims and empty follow CTAs while locked", () => {
    const risky = {
      ...card,
      hook: "We put it on the dyno",
      softCta: "follow for more",
      dynoSafe: false,
    };
    const next = enforceCard(risky, false);
    expect(next.dynoSafe).toBe(true);
    expect(next.hook).not.toMatch(/put it on the dyno/i);
    expect(next.softCta).toBe(SOFT_CTA);
    expect(hasEmptyFollowCta(next.softCta)).toBe(false);
  });

  it("lets the admin flag win", () => {
    expect(effectiveDynoUnlocked(false)).toBe(false);
    expect(effectiveDynoUnlocked(true)).toBe(true);
    const unlocked = enforceCard({ ...card, dynoSafe: false }, true);
    expect(unlocked.dynoSafe).toBe(false);
  });
});

describe("paste pack and handles", () => {
  it("builds caption, CapCut, and Descript text", () => {
    const card = parsePulseIngest(
      JSON.parse(readFileSync(fixturePath, "utf8")),
    ).recreateCards[0] as PulseRecreateCard;
    const pack = buildPastePack(card);
    expect(pack.caption).toContain(card.captionLine1);
    expect(pack.capcut).toContain("CapCut outline");
    expect(pack.descript).toContain("Descript beats");
    expect(pack.markdown).toContain("Do not rip footage");
  });

  it("normalizes handles and flags empty CTAs", () => {
    expect(
      normalizeHandle("https://www.tiktok.com/@SwaffordSpeed/video/1"),
    ).toBe("swaffordspeed");
    expect(ctaQuality(["follow for more"]).pass).toBe(false);
    expect(ctaQuality(["Book performance work"]).pass).toBe(true);
  });
});
