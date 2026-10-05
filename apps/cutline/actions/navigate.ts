/**
 * Navigate the UI to a view.
 *
 * Usage:
 *   pnpm action navigate --view=projects
 *   pnpm action navigate --view=editor --projectId=<id>
 */

import { defineAction } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

export default defineAction({
  description:
    'Move the user\'s screen. Views: "projects" (library at /), "editor" (requires projectId, opens /projects/:id), "shared", "templates", "brand-kit". Or pass an app path directly.',
  schema: z.object({
    view: z
      .enum(["projects", "editor", "shared", "templates", "brand-kit"])
      .optional()
      .describe(
        'Target view: "projects", "editor", "shared", "templates", or "brand-kit"',
      ),
    projectId: z
      .string()
      .optional()
      .describe("Project id to open (required for the editor view)"),
    path: z
      .string()
      .optional()
      .describe("App path to open, e.g. /projects/abc"),
  }),
  http: false,
  run: async ({ view, projectId, path }) => {
    if (!view && !path && !projectId) {
      throw new Error("Pass a view, a projectId, or a path.");
    }
    const target =
      path ??
      (projectId && (!view || view === "editor")
        ? `/projects/${encodeURIComponent(projectId)}`
        : view === "shared"
          ? "/shared"
          : view === "templates"
            ? "/templates"
            : view === "brand-kit"
              ? "/brand-kit"
              : "/");
    await writeAppStateForCurrentTab("navigate", {
      path: target,
      ...(view ? { view } : {}),
      ...(projectId ? { projectId } : {}),
      _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    return `Navigating to ${target}`;
  },
});
