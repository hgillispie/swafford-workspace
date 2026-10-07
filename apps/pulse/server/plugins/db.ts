import {
  ensureAdditiveColumns,
  getDbExec,
} from "@agent-native/core/db";

import "../db/index.js";
import { runPulseMigrations } from "../db/migrate.js";
import * as schema from "../db/schema.js";

function isDrizzleTable(value: unknown): value is object {
  return (
    !!value &&
    typeof value === "object" &&
    Object.getOwnPropertySymbols(value).some((symbol) =>
      symbol.toString().includes("drizzle"),
    )
  );
}

const schemaTables = Object.values(schema).filter(isDrizzleTable);

export { runPulseMigrations };

export default (nitroApp: { h3?: unknown }): void => {
  void (async () => {
    await runPulseMigrations(nitroApp);
    try {
      const summary = await ensureAdditiveColumns({
        db: getDbExec(),
        tables: schemaTables,
      });
      if (summary.errors.length > 0) {
        console.warn(
          "[db] ensureAdditiveColumns completed with errors:",
          summary.errors,
        );
      }
    } catch (err) {
      console.warn(
        "[db] ensureAdditiveColumns failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }
  })();
};
