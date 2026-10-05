import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import {
  assertFolderInOrg,
  dumpFolders,
  getDb,
  newId,
  requireActor,
  toFolder,
} from "../server/lib/dumps.js";

export default defineAction({
  description: "Create a folder in the private dump library.",
  schema: z.object({
    name: z.string().trim().min(1).max(160).describe("Folder name."),
    parentId: z
      .string()
      .nullable()
      .optional()
      .describe("Parent folder id. Omit or null for the library root."),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "dumps",
      view: "library",
      params: { folderId: result.id },
    }),
    label: "Open folder",
  }),
  run: async ({ name, parentId }) => {
    const { email, orgId } = requireActor();
    const parent = parentId ?? null;
    await assertFolderInOrg(parent, orgId);
    const id = newId();
    const [row] = await getDb()
      .insert(dumpFolders)
      .values({
        id,
        name,
        parentId: parent,
        ownerEmail: email,
        orgId,
        visibility: "org",
      })
      .returning();
    if (!row) {
      fail("Folder was not created.", { statusCode: 500 });
    }
    return {
      id: row.id,
      folder: toFolder(row),
      message: `Created folder ${row.name}.`,
    };
  },
});
