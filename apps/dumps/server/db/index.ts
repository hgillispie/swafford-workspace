import { createGetDb } from "@agent-native/core/db";
import { registerIdentityColumns } from "@agent-native/core/org";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerIdentityColumns([
  {
    table: "dump_files",
    column: "uploader_email",
    emailChange: "retain",
    offboard: "retain",
    reason: "Uploader attribution on a private file dump.",
  },
]);
