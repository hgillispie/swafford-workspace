import { and, desc, eq, sql } from "@agent-native/core/db/schema";
import { randomUUID } from "node:crypto";

import { getDb } from "../db/index.js";
import {
  scoutAudits,
  scoutCache,
  scoutCompetitors,
  scoutDrafts,
  scoutRecreates,
  scoutReports,
} from "../db/schema.js";
import type { Actor } from "./access.js";
import { TTL_MS, type CacheKind } from "../../shared/provider.js";

function owned(actor: Actor) {
  return {
    ownerEmail: actor.email,
    orgId: actor.orgId,
    visibility: "org" as const,
  };
}

export function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export interface CacheRow<T> {
  payload: T;
  expiresAt: string;
  fetchedAt: string;
  cursor: string | null;
}

export async function readCache<T>(
  orgId: string,
  cacheKey: string,
): Promise<CacheRow<T> | null> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(scoutCache)
      .where(and(eq(scoutCache.orgId, orgId), eq(scoutCache.cacheKey, cacheKey)))
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    payload: parseJson<T>(row.payloadJson, null as T),
    expiresAt: row.expiresAt,
    fetchedAt: row.fetchedAt,
    cursor: row.cursor,
  };
}

export async function writeCache(
  actor: Actor,
  input: {
    cacheKey: string;
    kind: CacheKind;
    query: string;
    payload: unknown;
    cursor?: string | null;
  },
): Promise<void> {
  const db = getDb();
  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TTL_MS[input.kind]).toISOString();
  const values = {
    kind: input.kind,
    query: input.query,
    payloadJson: JSON.stringify(input.payload),
    cursor: input.cursor ?? null,
    fetchedAt,
    expiresAt,
    ...owned(actor),
    orgId: actor.orgId,
  };
  await db
    .insert(scoutCache)
    .values({ id: randomUUID(), cacheKey: input.cacheKey, ...values })
    .onConflictDoUpdate({
      target: [scoutCache.orgId, scoutCache.cacheKey],
      set: values,
    });
}

export async function upsertCompetitor(
  actor: Actor,
  input: {
    handle: string;
    displayName: string | null;
    role: string;
    snapshot: unknown;
  },
): Promise<void> {
  const db = getDb();
  const values = {
    displayName: input.displayName,
    role: input.role,
    snapshotJson: JSON.stringify(input.snapshot),
    updatedAt: new Date().toISOString(),
    ...owned(actor),
    orgId: actor.orgId,
  };
  await db
    .insert(scoutCompetitors)
    .values({ id: randomUUID(), handle: input.handle, ...values })
    .onConflictDoUpdate({
      target: [scoutCompetitors.orgId, scoutCompetitors.handle],
      set: values,
    });
}

export async function listCompetitors(orgId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(scoutCompetitors)
    .where(eq(scoutCompetitors.orgId, orgId));
  return rows;
}

export async function insertAudit(
  actor: Actor,
  handle: string,
  summary: unknown,
): Promise<string> {
  const id = randomUUID();
  const db = getDb();
  await db.insert(scoutAudits).values({
    id,
    handle,
    summaryJson: JSON.stringify(summary),
    narrative: null,
    createdAt: new Date().toISOString(),
    ...owned(actor),
    orgId: actor.orgId,
  });
  return id;
}

export async function saveAuditNarrative(
  actor: Actor,
  id: string,
  narrative: string,
): Promise<boolean> {
  const db = getDb();
  const existing = (
    await db.select().from(scoutAudits).where(and(eq(scoutAudits.id, id), eq(scoutAudits.orgId, actor.orgId))).limit(1)
  )[0];
  if (!existing || existing.orgId !== actor.orgId) return false;
  await db.update(scoutAudits).set({ narrative }).where(and(eq(scoutAudits.id, id), eq(scoutAudits.orgId, actor.orgId)));
  return true;
}

export async function listAudits(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(scoutAudits)
    .where(eq(scoutAudits.orgId, orgId))
    .orderBy(desc(scoutAudits.createdAt))
    .limit(12);
}

export async function insertReport(
  actor: Actor,
  input: { kind: string; title: string; packet: unknown },
): Promise<string> {
  const id = randomUUID();
  const db = getDb();
  await db.insert(scoutReports).values({
    id,
    kind: input.kind,
    title: input.title,
    packetJson: JSON.stringify(input.packet),
    narrative: null,
    status: "packet",
    createdAt: new Date().toISOString(),
    ...owned(actor),
    orgId: actor.orgId,
  });
  return id;
}

export async function saveReportNarrative(
  actor: Actor,
  id: string,
  narrative: string,
): Promise<boolean> {
  const db = getDb();
  const existing = (
    await db.select().from(scoutReports).where(and(eq(scoutReports.id, id), eq(scoutReports.orgId, actor.orgId))).limit(1)
  )[0];
  if (!existing || existing.orgId !== actor.orgId) return false;
  await db
    .update(scoutReports)
    .set({ narrative, status: "written" })
    .where(and(eq(scoutReports.id, id), eq(scoutReports.orgId, actor.orgId)));
  return true;
}

export async function latestReport(orgId: string, kind: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(scoutReports)
    .where(eq(scoutReports.orgId, orgId))
    .orderBy(desc(scoutReports.createdAt))
    .limit(20);
  return rows.find((row) => row.kind === kind) ?? null;
}

export async function rememberIntelligenceMisses(
  orgId: string,
  missed: { handle: string; displayName: string }[],
): Promise<void> {
  if (missed.length === 0) return;
  const current = await latestReport(orgId, "intelligence");
  if (!current) return;
  const packet = parseJson<Record<string, unknown>>(current.packetJson, {});
  const previous = Array.isArray(packet.missedHandles) ? packet.missedHandles : [];
  const byHandle = new Map<string, { handle: string; displayName: string }>();
  for (const item of [...previous, ...missed]) {
    if (!item || typeof item !== "object") continue;
    const record = item as { handle?: unknown; displayName?: unknown };
    if (typeof record.handle !== "string" || !record.handle) continue;
    byHandle.set(record.handle, {
      handle: record.handle,
      displayName: typeof record.displayName === "string" ? record.displayName : record.handle,
    });
  }
  packet.missedHandles = [...byHandle.values()];
  const db = getDb();
  await db
    .update(scoutReports)
    .set({ packetJson: JSON.stringify(packet) })
    .where(and(eq(scoutReports.id, current.id), eq(scoutReports.orgId, orgId)));
}

export async function insertRecreate(
  actor: Actor,
  input: {
    sourceVideoId: string | null;
    sourceHandle: string | null;
    sourceUrl: string | null;
    card: unknown;
    paste: unknown;
    status: string;
  },
): Promise<string> {
  const id = randomUUID();
  const db = getDb();
  await db.insert(scoutRecreates).values({
    id,
    sourceVideoId: input.sourceVideoId,
    sourceHandle: input.sourceHandle,
    sourceUrl: input.sourceUrl,
    cardJson: JSON.stringify(input.card),
    pasteJson: JSON.stringify(input.paste),
    status: input.status,
    createdAt: new Date().toISOString(),
    ...owned(actor),
    orgId: actor.orgId,
  });
  return id;
}

export async function updateRecreate(
  actor: Actor,
  id: string,
  input: { card: unknown; paste: unknown; status: string },
): Promise<boolean> {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(scoutRecreates)
      .where(and(eq(scoutRecreates.id, id), eq(scoutRecreates.orgId, actor.orgId)))
      .limit(1)
  )[0];
  if (!existing || existing.orgId !== actor.orgId) return false;
  await db
    .update(scoutRecreates)
    .set({
      cardJson: JSON.stringify(input.card),
      pasteJson: JSON.stringify(input.paste),
      status: input.status,
    })
    .where(and(eq(scoutRecreates.id, id), eq(scoutRecreates.orgId, actor.orgId)));
  return true;
}

export async function readRecreate(orgId: string, id: string) {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(scoutRecreates)
      .where(and(eq(scoutRecreates.id, id), eq(scoutRecreates.orgId, orgId)))
      .limit(1)
  )[0];
  if (!row || row.orgId !== orgId) return null;
  return row;
}

export async function listRecreates(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(scoutRecreates)
    .where(eq(scoutRecreates.orgId, orgId))
    .orderBy(desc(scoutRecreates.createdAt))
    .limit(20);
}

export async function insertDraft(
  actor: Actor,
  input: { kind: string; topic: string; body: string },
): Promise<string> {
  const id = randomUUID();
  const db = getDb();
  await db.insert(scoutDrafts).values({
    id,
    kind: input.kind,
    topic: input.topic,
    body: input.body,
    createdAt: new Date().toISOString(),
    ...owned(actor),
    orgId: actor.orgId,
  });
  return id;
}

export async function updateDraft(
  actor: Actor,
  id: string,
  body: string,
): Promise<boolean> {
  const db = getDb();
  const existing = (
    await db.select().from(scoutDrafts).where(and(eq(scoutDrafts.id, id), eq(scoutDrafts.orgId, actor.orgId))).limit(1)
  )[0];
  if (!existing || existing.orgId !== actor.orgId) return false;
  await db.update(scoutDrafts).set({ body }).where(and(eq(scoutDrafts.id, id), eq(scoutDrafts.orgId, actor.orgId)));
  return true;
}

export async function listDrafts(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(scoutDrafts)
    .where(eq(scoutDrafts.orgId, orgId))
    .orderBy(desc(scoutDrafts.createdAt))
    .limit(20);
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const record = result as { rows?: Record<string, unknown>[] };
  return record.rows ?? [];
}

export async function readPulseEnrichment(orgId: string): Promise<{
  headline: string;
  mattBlurb: string;
  reportDate: string;
} | null> {
  try {
    const result = await getDb().execute(sql`
      SELECT headline, matt_blurb, report_date
      FROM pulse_reports
      WHERE org_id = ${orgId}
      ORDER BY report_date DESC
      LIMIT 1
    `);
    const row = rowsOf(result)[0];
    if (!row?.headline) return null;
    return {
      headline: String(row.headline),
      mattBlurb: String(row.matt_blurb ?? ""),
      reportDate: String(row.report_date ?? ""),
    };
  } catch {
    return null;
  }
}

export async function sendPulseIdea(
  actor: Actor,
  input: {
    title: string;
    notes: string | null;
    pillar: string;
    searchVsTrend: string;
    dynoSafe: boolean;
    geo: string | null;
    softCta: string;
    sourceId: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await getDb().execute(sql`
    INSERT INTO pulse_ideas (
      id, report_id, source_card_id, title, notes, status, assignee, pillar,
      search_vs_trend, dyno_safe, geo, soft_cta, owner_email, org_id, visibility
    ) VALUES (
      ${id},
      ${null},
      ${input.sourceId},
      ${input.title},
      ${input.notes},
      'idea',
      'matt',
      ${input.pillar},
      ${input.searchVsTrend},
      ${input.dynoSafe},
      ${input.geo},
      ${input.softCta},
      ${actor.email},
      ${actor.orgId},
      'org'
    )
  `);
  return id;
}
