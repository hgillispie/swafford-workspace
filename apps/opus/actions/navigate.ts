/**
 * Navigate the UI to a view.
 *
 * Writes a navigate command to application state which the UI reads and auto-deletes.
 *
 * Usage:
 *   pnpm action navigate --view=studio
 *   pnpm action navigate --view=project --projectId=<id>
 *   pnpm action navigate --path=/some/route
 *
 * Options:
 *   --view   View name to navigate to
 *   --path   URL path to navigate to
 *   --threadId Chat thread ID to open on the chat route
 */

import { defineAction, fail } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

export default defineAction({
  description:
    "Open the studio or a clip project in the user's browser. Use view=studio or view=project with projectId, or pass a local path.",
  schema: z.object({
    view: z
      .enum(["studio", "project"])
      .optional()
      .describe("Studio home or project detail"),
    path: z
      .string()
      .regex(/^\/(?!\/)/)
      .optional()
      .describe("Local app URL path to open"),
    projectId: z.uuid().optional().describe("Project id when view is project"),
  }),
  http: false,
  run: async (args) => {
    if (!args.view && !args.path) {
      fail("Pass a view or path");
    }
    if (args.view === "project" && !args.projectId && !args.path) {
      fail("Pass projectId to open a project");
    }
    const nav: Record<string, string> = {};
    if (args.view) nav.view = args.view;
    if (args.path) nav.path = args.path;
    if (args.projectId) nav.projectId = args.projectId;
    nav._writeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeAppStateForCurrentTab("navigate", nav);
    return `Navigating to ${args.view || args.path}`;
  },
});
