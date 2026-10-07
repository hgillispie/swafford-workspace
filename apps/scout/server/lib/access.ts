import { fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { orgMembers } from "@agent-native/core/org";
import {
  getRequestOrgId,
  getRequestUserEmail,
  resolveSecret,
} from "@agent-native/core/server";

import { getDb } from "../db/index.js";
import { scoutSettings } from "../db/schema.js";
import { mergeBrand, type BrandConfig } from "../../shared/brand.js";
import { SCRAPECREATORS_KEY } from "../../shared/provider.js";

export interface Actor {
  email: string;
  orgId: string;
  role: string;
}

export async function requireMember(): Promise<Actor> {
  const email = getRequestUserEmail()?.trim();
  const orgId = getRequestOrgId()?.trim();
  if (!email || !orgId) {
    fail("Sign in to use Scout.", {
      statusCode: 401,
      errorCode: "unauthenticated",
    });
  }
  const db = getDb();
  const member = (
    await db
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.email, email)))
      .limit(1)
  )[0];
  if (!member) {
    fail("You are not a member of this workspace.", {
      statusCode: 403,
      errorCode: "forbidden",
    });
  }
  return { email, orgId, role: member.role };
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireMember();
  if (actor.role !== "owner" && actor.role !== "admin") {
    fail("An owner or admin has to change Scout brand settings.", {
      statusCode: 403,
      errorCode: "forbidden",
    });
  }
  return actor;
}

export async function readBrand(orgId: string): Promise<BrandConfig> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(scoutSettings)
      .where(and(eq(scoutSettings.id, orgId), eq(scoutSettings.orgId, orgId)))
      .limit(1)
  )[0];
  if (!row) return mergeBrand(null);
  let saved: Partial<BrandConfig> = {};
  try {
    saved = JSON.parse(row.brandJson) as Partial<BrandConfig>;
  } catch {
    saved = {};
  }
  saved.dynoUnlocked = row.dynoUnlocked === true;
  return mergeBrand(saved);
}

export async function saveBrand(actor: Actor, brand: BrandConfig): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const values = {
    brandJson: JSON.stringify(brand),
    dynoUnlocked: brand.dynoUnlocked === true,
    updatedAt: now,
    ownerEmail: actor.email,
    orgId: actor.orgId,
    visibility: "org" as const,
  };
  await db
    .insert(scoutSettings)
    .values({ id: actor.orgId, ...values })
    .onConflictDoUpdate({
      target: scoutSettings.id,
      set: values,
    });
}

export async function readScrapeKey(): Promise<string | null> {
  try {
    const fromVault = (await resolveSecret(SCRAPECREATORS_KEY))?.trim();
    if (fromVault) return fromVault;
  } catch {
    // Vault lookup can fail closed. The deploy env var is the post-merge path.
  }
  // guard:allow-env-credential — hosted workspaces hide generic env fallback from signed-in users, and the key is set as a deploy env var after merge
  const fromEnv = process.env.SCRAPECREATORS_API_KEY?.trim();
  return fromEnv || null;
}
