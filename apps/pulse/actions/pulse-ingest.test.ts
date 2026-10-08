import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "@agent-native/core/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parsePulseIngest, type PulseIngest } from "../shared/pulse-schema.js";

const CONFIGURED_ORG = "a1b2c3d4e5f64789a1b2c3d4e5f64789";
const OTHER_ORG_A = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER_ORG_B = "cccccccccccccccccccccccccccccccc";
const INGEST_SECRET = "test-ingest-secret";
const TEST_DB_PATH = mkdtempSync(join(tmpdir(), "pulse-ingest-"));

const previousDatabaseUrl = process.env.DATABASE_URL;
const previousOrgId = process.env.PULSE_INGEST_ORG_ID;
const previousSecret = process.env.PULSE_INGEST_SECRET;

process.env.DATABASE_URL = `pglite:${TEST_DB_PATH}`;
process.env.PULSE_INGEST_SECRET = INGEST_SECRET;
process.env.PULSE_INGEST_ORG_ID = CONFIGURED_ORG;

type IngestAction = {
  run: (
    payload: PulseIngest,
    ctx: { requestHeaders: Headers },
  ) => Promise<{ id: string; replaced: boolean; idempotencyKey: string }>;
};

let action: IngestAction;
let getDb: typeof import("../server/db/index.js").getDb;
let pulseReports: typeof import("../server/db/schema.js").pulseReports;
let pulseRecreateCards: typeof import("../server/db/schema.js").pulseRecreateCards;

const fixture = parsePulseIngest(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../fixtures/pulse-2026-10-05-tiktok.json"),
      "utf8",
    ),
  ),
);

function bearer() {
  return {
    requestHeaders: new Headers({
      authorization: `Bearer ${INGEST_SECRET}`,
    }),
  };
}

beforeAll(async () => {
  const dbModule = await import("../server/db/index.js");
  getDb = dbModule.getDb;
  pulseReports = dbModule.schema.pulseReports;
  pulseRecreateCards = dbModule.schema.pulseRecreateCards;
  const { runPulseMigrations } = await import("../server/db/migrate.js");
  await runPulseMigrations(undefined as never);
  const { getDbExec } = await import("@agent-native/core/db");
  await getDbExec().execute(
    `CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, allowed_domain TEXT)`,
  );
  await getDbExec().execute({
    sql: `INSERT INTO organizations (id) VALUES ($1), ($2), ($3)`,
    args: [CONFIGURED_ORG, OTHER_ORG_A, OTHER_ORG_B],
  });
  action = (await import("./pulse-ingest.js")).default as IngestAction;
}, 60_000);

afterAll(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousOrgId === undefined) delete process.env.PULSE_INGEST_ORG_ID;
  else process.env.PULSE_INGEST_ORG_ID = previousOrgId;
  if (previousSecret === undefined) delete process.env.PULSE_INGEST_SECRET;
  else process.env.PULSE_INGEST_SECRET = previousSecret;
  rmSync(TEST_DB_PATH, { force: true, recursive: true });
});

describe("pulse bearer ingest", () => {
  it("keeps the previous org_unresolved error when PULSE_INGEST_ORG_ID is unset", async () => {
    delete process.env.PULSE_INGEST_ORG_ID;
    try {
      await expect(action.run(fixture, bearer())).rejects.toMatchObject({
        errorCode: "org_unresolved",
        statusCode: 503,
      });
      const rows = await getDb().select({ id: pulseReports.id }).from(pulseReports);
      expect(rows).toHaveLength(0);
    } finally {
      process.env.PULSE_INGEST_ORG_ID = CONFIGURED_ORG;
    }
  });

  it("stores a sessionless bearer post on the configured org when several orgs exist", async () => {
    const saved = await action.run(fixture, bearer());
    expect(saved.replaced).toBe(false);
    expect(saved.idempotencyKey).toBe("2026-10-05:tiktok");

    const rows = await getDb()
      .select({
        id: pulseReports.id,
        orgId: pulseReports.orgId,
      })
      .from(pulseReports);
    expect(rows).toEqual([{ id: saved.id, orgId: CONFIGURED_ORG }]);
    const elsewhere = rows.filter((row) => row.orgId !== CONFIGURED_ORG);
    expect(elsewhere).toHaveLength(0);
  });

  it("replaces the same reportDate:source instead of inserting a second row", async () => {
    const first = await getDb()
      .select({ id: pulseReports.id })
      .from(pulseReports)
      .where(eq(pulseReports.idempotencyKey, "2026-10-05:tiktok"));
    const updated = structuredClone(fixture);
    updated.summary.headline = "Updated headline for the same day";

    const saved = await action.run(updated, bearer());
    expect(saved.replaced).toBe(true);
    expect(saved.id).toBe(first[0]?.id);
    expect(saved.idempotencyKey).toBe("2026-10-05:tiktok");

    const rows = await getDb()
      .select({
        id: pulseReports.id,
        headline: pulseReports.headline,
        orgId: pulseReports.orgId,
      })
      .from(pulseReports)
      .where(
        eq(pulseReports.orgId, CONFIGURED_ORG),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.headline).toBe("Updated headline for the same day");

    const cards = await getDb()
      .select({ id: pulseRecreateCards.id })
      .from(pulseRecreateCards)
      .where(eq(pulseRecreateCards.reportId, saved.id));
    expect(cards).toHaveLength(fixture.recreateCards.length);
  });
});
