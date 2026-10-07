import { fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { orgMembers, organizations } from "@agent-native/core/org";
import { resolveSecret } from "@agent-native/core/server";
import {
  getRequestOrgId,
  getRequestUserEmail,
} from "@agent-native/core/server";
import { timingSafeEqual } from "node:crypto";

import { getDb } from "../db/index.js";
import { pulseSettings } from "../db/schema.js";

export const INGEST_SECRET_KEY = "PULSE_INGEST_SECRET";
export const INGEST_ORG_ID_ENV = "PULSE_INGEST_ORG_ID";

/** Organization ids are `randomUUID()` with the dashes removed. */
const INGEST_ORG_ID_PATTERN = /^[0-9a-f]{32}$/i;

export function bearerFromHeader(header: string | null | undefined): string {
  const value = header ?? "";
  return value.toLowerCase().startsWith("bearer ")
    ? value.slice("bearer ".length).trim()
    : "";
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function readIngestSecret(): Promise<string | null> {
  try {
    const value = (await resolveSecret(INGEST_SECRET_KEY))?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export async function assertIngestAuthorized(header: string | null | undefined) {
  const secret = await readIngestSecret();
  const bearer = bearerFromHeader(header);
  if (bearer) {
    if (!secret) {
      fail("PULSE_INGEST_SECRET is not configured.", {
        statusCode: 503,
        errorCode: "ingest_secret_missing",
      });
    }
    if (!secretsMatch(bearer, secret)) {
      fail("Ingest bearer token was rejected.", {
        statusCode: 401,
        errorCode: "unauthorized",
      });
    }
    return { mode: "bearer" as const };
  }
  const email = getRequestUserEmail()?.trim();
  if (!email) {
    fail("Authorization: Bearer <PULSE_INGEST_SECRET> is required.", {
      statusCode: 401,
      errorCode: "unauthorized",
    });
  }
  const actor = await requireMember();
  return { mode: "session" as const, ...actor };
}

/**
 * Organization that owns Brandbot bearer ingest. Deploy config only.
 * A missing or malformed value fails closed. This never reads the session
 * and never picks an organization because the database has exactly one.
 */
export function readConfiguredIngestOrgId(): string {
  // guard:allow-env-credential — deploy-level org id for unauthenticated Brandbot ingest, not a user credential
  const raw = process.env.PULSE_INGEST_ORG_ID?.trim() ?? "";
  if (!raw) {
    fail(
      `${INGEST_ORG_ID_ENV} is not set. Set it to the 32-character hex organization id that should receive Brandbot reports. Pulse will not choose an organization.`,
      { statusCode: 503, errorCode: "ingest_org_missing" },
    );
  }
  if (!INGEST_ORG_ID_PATTERN.test(raw)) {
    fail(
      `${INGEST_ORG_ID_ENV} must be a 32-character hex organization id with no dashes.`,
      { statusCode: 503, errorCode: "ingest_org_invalid" },
    );
  }
  return raw.toLowerCase();
}

export async function resolveBearerIngestOrgId(): Promise<string> {
  const orgId = readConfiguredIngestOrgId();
  const db = getDb();
  const row = (
    await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
  )[0];
  if (!row) {
    fail(
      `${INGEST_ORG_ID_ENV} does not match an organization in this database.`,
      { statusCode: 503, errorCode: "ingest_org_unknown" },
    );
  }
  return orgId;
}

export function isOrgAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function requireMember(): Promise<{
  email: string;
  orgId: string;
  role: string;
}> {
  const email = getRequestUserEmail()?.trim();
  const orgId = getRequestOrgId()?.trim();
  if (!email || !orgId) {
    fail("Sign in to use Pulse.", {
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

export async function requireAdmin(): Promise<{
  email: string;
  orgId: string;
  role: string;
}> {
  const actor = await requireMember();
  if (!isOrgAdmin(actor.role)) {
    fail("Hunter admin access is required for this Pulse setting.", {
      statusCode: 403,
      errorCode: "forbidden",
    });
  }
  return actor;
}

export async function readDynoUnlocked(orgId: string): Promise<boolean> {
  const db = getDb();
  const row = (
    await db
      .select({ dynoUnlocked: pulseSettings.dynoUnlocked })
      .from(pulseSettings)
      .where(
        and(eq(pulseSettings.id, orgId), eq(pulseSettings.orgId, orgId)),
      )
      .limit(1)
  )[0];
  return row?.dynoUnlocked === true;
}
