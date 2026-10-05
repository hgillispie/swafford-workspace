import { createGetDb } from "@agent-native/core/db";
import { registerShareableResource } from "@agent-native/core/sharing";

import * as schema from "../drizzle/schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerShareableResource({
  type: "opus-project",
  resourceTable: schema.projects,
  sharesTable: schema.projectShares,
  displayName: "Project",
  titleColumn: "title",
  getResourcePath: (project) => `/projects/${project.id}`,
  getDb,
});
