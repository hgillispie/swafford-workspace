import { fail } from "@agent-native/core/action";
import {
  getRequestOrgId,
  getRequestUserEmail,
} from "@agent-native/core/server/request-context";
import { assertAccess, resolveAccess } from "@agent-native/core/sharing";

import { schema } from "../db.js";

export type ProjectRow = typeof schema.projects.$inferSelect;

export function requireUserEmail(): string {
  const email = getRequestUserEmail();
  if (!email) {
    fail("Sign in to continue.", {
      statusCode: 401,
      errorCode: "unauthenticated",
    });
  }
  return email;
}

export function currentOrgId(): string | null {
  return getRequestOrgId() ?? null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function readProject(id: string): Promise<ProjectRow> {
  requireUserEmail();
  const access = await resolveAccess("opus-project", id);
  if (!access) {
    fail("Project not found.", { statusCode: 404, errorCode: "not_found" });
  }
  return access.resource as ProjectRow;
}

export async function editProject(id: string): Promise<ProjectRow> {
  requireUserEmail();
  const visible = await resolveAccess("opus-project", id);
  if (!visible) {
    fail("Project not found.", { statusCode: 404, errorCode: "not_found" });
  }
  const access = await assertAccess("opus-project", id, "editor");
  return access.resource as ProjectRow;
}
