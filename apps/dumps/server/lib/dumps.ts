import { randomUUID } from "node:crypto";

import { fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import {
  getRequestOrgId,
  getRequestUserEmail,
} from "@agent-native/core/server";

import { getDb } from "../db/index.js";
import { dumpFiles, dumpFolders, dumpShares } from "../db/schema.js";
import { B2ConfigError, publicB2Error } from "./b2.js";

export function requireActor(): { email: string; orgId: string } {
  const email = getRequestUserEmail()?.trim();
  const orgId = getRequestOrgId()?.trim();
  if (!email || !orgId) {
    fail("Sign in to use Dumps.", {
      statusCode: 401,
      errorCode: "unauthenticated",
    });
  }
  return { email, orgId };
}

export function failB2(err: unknown): never {
  if (err instanceof B2ConfigError) {
    fail(err.message, {
      statusCode: 503,
      errorCode: "b2_not_configured",
      details: { missingEnv: err.missing },
    });
  }
  fail(publicB2Error(err), {
    statusCode: 502,
    errorCode: "b2_request_failed",
  });
}

export function newId(): string {
  return randomUUID();
}

export function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is string => typeof tag === "string");
  } catch {
    return [];
  }
}

export function toFolder(row: typeof dumpFolders.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    createdAt: row.createdAt,
  };
}

export function toFile(row: typeof dumpFiles.$inferSelect) {
  return {
    id: row.id,
    folderId: row.folderId,
    filename: row.filename,
    sizeBytes: row.sizeBytes,
    contentType: row.contentType,
    uploaderEmail: row.uploaderEmail,
    notes: row.notes,
    tags: parseTags(row.tags),
    b2Key: row.b2Key,
    uploadId: row.uploadId,
    partSizeBytes: row.partSizeBytes,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export async function loadFolder(id: string, orgId: string) {
  const [row] = await getDb()
    .select()
    .from(dumpFolders)
    .where(and(eq(dumpFolders.id, id), eq(dumpFolders.orgId, orgId)))
    .limit(1);
  if (!row) {
    fail("Folder not found.", { statusCode: 404, errorCode: "not_found" });
  }
  return row;
}

export async function loadFile(id: string, orgId: string) {
  const [row] = await getDb()
    .select()
    .from(dumpFiles)
    .where(and(eq(dumpFiles.id, id), eq(dumpFiles.orgId, orgId)))
    .limit(1);
  if (!row) {
    fail("File not found.", { statusCode: 404, errorCode: "not_found" });
  }
  return row;
}

export async function assertFolderInOrg(
  folderId: string | null | undefined,
  orgId: string,
) {
  if (!folderId) return;
  await loadFolder(folderId, orgId);
}

export async function assertNoFolderCycle(
  folderId: string,
  nextParentId: string | null,
  orgId: string,
) {
  let current = nextParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === folderId || seen.has(current)) {
      fail("A folder cannot be moved into itself.", {
        statusCode: 409,
        errorCode: "folder_cycle",
      });
    }
    seen.add(current);
    const [row] = await getDb()
      .select({ parentId: dumpFolders.parentId })
      .from(dumpFolders)
      .where(and(eq(dumpFolders.id, current), eq(dumpFolders.orgId, orgId)))
      .limit(1);
    current = row?.parentId ?? null;
  }
}

export async function breadcrumbs(folderId: string | null, orgId: string) {
  const crumbs: Array<{ id: string; name: string }> = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current) && crumbs.length < 20) {
    seen.add(current);
    const [row] = await getDb()
      .select({
        id: dumpFolders.id,
        name: dumpFolders.name,
        parentId: dumpFolders.parentId,
      })
      .from(dumpFolders)
      .where(and(eq(dumpFolders.id, current), eq(dumpFolders.orgId, orgId)))
      .limit(1);
    if (!row) break;
    crumbs.unshift({ id: row.id, name: row.name });
    current = row.parentId;
  }
  return crumbs;
}

export { dumpFiles, dumpFolders, dumpShares, getDb };
