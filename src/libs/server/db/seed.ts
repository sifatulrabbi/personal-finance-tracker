import type { BunSqlDatabase } from "@/libs/server/db/client";

type SeedTable = "households" | "users" | "people";
type SeedHouseholdKey = "real" | "test";

export const SEED_HOUSEHOLDS = {
  real: {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Sifatul's Household",
    seedUser: {
      id: "00000000-0000-4000-8000-000000000102",
      email: "mdsifatulislam.rabbi@gmail.com",
    },
    defaultPerson: {
      id: "00000000-0000-4000-8000-000000000103",
      name: "Household",
    },
  },
  test: {
    id: "00000000-0000-4000-8000-000000000201",
    name: "Test Household",
    seedUser: {
      id: "00000000-0000-4000-8000-000000000202",
      email: "sifatuli.r@gmail.com",
    },
    defaultPerson: {
      id: "00000000-0000-4000-8000-000000000203",
      name: "Household",
    },
  },
} as const;

export type SeedRecordAction = "inserted" | "skipped";

export type SeedRecordResult = Readonly<{
  action: SeedRecordAction;
  table: SeedTable;
  key: string;
}>;

export type SeedDatabaseResult = Readonly<{
  records: SeedRecordResult[];
}>;

type InsertedRow = {
  id: string;
};

async function assertHouseholdNameAvailable({
  db,
  householdKey,
}: {
  db: BunSqlDatabase;
  householdKey: SeedHouseholdKey;
}): Promise<void> {
  const household = SEED_HOUSEHOLDS[householdKey];
  const rows = (await db`
    SELECT id::text AS id
    FROM households
    WHERE name = ${household.name}
      AND id <> ${household.id}
    LIMIT 1
  `) as InsertedRow[];

  if (rows.length > 0) {
    throw new Error(
      `Seed household "${household.name}" already exists with a different id.`,
    );
  }
}

function createSeedRecordResult({
  rows,
  table,
  key,
}: {
  rows: InsertedRow[];
  table: SeedTable;
  key: string;
}): SeedRecordResult {
  return {
    action: rows.length > 0 ? "inserted" : "skipped",
    table,
    key,
  };
}

async function seedHousehold({
  db,
  householdKey,
}: {
  db: BunSqlDatabase;
  householdKey: SeedHouseholdKey;
}): Promise<SeedRecordResult> {
  const household = SEED_HOUSEHOLDS[householdKey];

  await assertHouseholdNameAvailable({ db, householdKey });

  const rows = (await db`
    INSERT INTO households (id, name)
    VALUES (${household.id}, ${household.name})
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as InsertedRow[];

  return createSeedRecordResult({
    rows,
    table: "households",
    key: `${householdKey}.household`,
  });
}

async function seedUser({
  db,
  householdKey,
}: {
  db: BunSqlDatabase;
  householdKey: SeedHouseholdKey;
}): Promise<SeedRecordResult> {
  const household = SEED_HOUSEHOLDS[householdKey];
  const rows = (await db`
    INSERT INTO users (
      id,
      household_id,
      email,
      name,
      workos_user_id,
      is_drafted
    )
    VALUES (
      ${household.seedUser.id},
      ${household.id},
      ${household.seedUser.email},
      ${null},
      ${null},
      ${true}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as InsertedRow[];

  return createSeedRecordResult({
    rows,
    table: "users",
    key: `${householdKey}.seedUser`,
  });
}

async function seedDefaultPerson({
  db,
  householdKey,
}: {
  db: BunSqlDatabase;
  householdKey: SeedHouseholdKey;
}): Promise<SeedRecordResult> {
  const household = SEED_HOUSEHOLDS[householdKey];
  const rows = (await db`
    INSERT INTO people (id, household_id, name, is_default)
    VALUES (
      ${household.defaultPerson.id},
      ${household.id},
      ${household.defaultPerson.name},
      ${true}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as InsertedRow[];

  return createSeedRecordResult({
    rows,
    table: "people",
    key: `${householdKey}.defaultPerson`,
  });
}

/**
 * Seeds the required household bootstrap records without updating existing
 * rows. Natural-key conflicts under different IDs intentionally fail loudly.
 */
export async function seedDatabase({
  db,
}: {
  db: BunSqlDatabase;
}): Promise<SeedDatabaseResult> {
  const records = await db.begin(async (transactionDb: BunSqlDatabase) => {
    const seedRecords: SeedRecordResult[] = [];

    for (const householdKey of Object.keys(
      SEED_HOUSEHOLDS,
    ) as SeedHouseholdKey[]) {
      seedRecords.push(
        await seedHousehold({ db: transactionDb, householdKey }),
      );
      seedRecords.push(await seedUser({ db: transactionDb, householdKey }));
      seedRecords.push(
        await seedDefaultPerson({ db: transactionDb, householdKey }),
      );
    }

    return seedRecords;
  });

  return {
    records,
  };
}
