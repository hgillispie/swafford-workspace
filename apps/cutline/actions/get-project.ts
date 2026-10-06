import { defineAction, fail } from "@agent-native/core/action";
import { resolveAccess } from "@agent-native/core/sharing";
import { z } from "zod";

import { presignGet } from "../server/lib/b2.js";
import {
  loadSpeakers,
  loadWords,
  requireUserEmail,
  toSummary,
  type ProjectRow,
} from "../server/lib/projects.js";

export default defineAction({
  description:
    "Load one project with its full word-level transcript for the editor UI. Agents should use get-transcript instead.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
  }),
  http: { method: "GET" },
  readOnly: true,
  agentTool: false,
  run: async ({ id }) => {
    requireUserEmail();
    const access = await resolveAccess("project", id);
    if (!access)
      fail("Project not found.", { statusCode: 404, errorCode: "not_found" });
    const row = access.resource as ProjectRow;
    const [speakers, words] = await Promise.all([
      loadSpeakers(id),
      loadWords(id),
    ]);
    let mediaUrl = row.proxyKey ? null : row.mediaUrl;
    if (row.proxyKey) {
      try {
        mediaUrl = (
          await presignGet({
            key: row.proxyKey,
            filename: row.mediaFilename || "proxy.mp4",
            contentType: "video/mp4",
          })
        ).url;
      } catch {
        mediaUrl = null;
      }
    }
    return {
      project: { ...toSummary(row), mediaUrl },
      canEdit:
        access.role === "owner" ||
        access.role === "admin" ||
        access.role === "editor",
      speakers,
      words,
    };
  },
});
