import { z } from "zod";

const POSTGRES_URL_ERROR = "must be a valid Postgres connection URL.";

export type EnvironmentMap = Record<string, string | undefined>;

/**
 * Server runtime configuration required by normal app execution.
 */
export type AppConfig = Readonly<{
  database: Readonly<{
    url: string;
  }>;
}>;

/**
 * Server configuration required only by integration tests and test scripts.
 */
export type TestAppConfig = Readonly<{
  database: Readonly<{
    url: string;
  }>;
}>;

/**
 * Dependencies used to build config without mutating global process env in tests.
 */
export type AppConfigDependencies = Readonly<{
  env?: EnvironmentMap;
}>;

const postgresConnectionUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isPostgresConnectionUrl);

const appConfigEnvSchema = z.object({
  DATABASE_URL: postgresConnectionUrlSchema,
});

const testAppConfigEnvSchema = z.object({
  TEST_DATABASE_URL: postgresConnectionUrlSchema,
});

let cachedAppConfig: AppConfig | null = null;

function isPostgresConnectionUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function formatConfigError(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  const envKey =
    firstIssue?.path[0] && typeof firstIssue.path[0] === "string"
      ? firstIssue.path[0]
      : "UNKNOWN_ENV";

  return `Invalid server config: ${envKey} ${POSTGRES_URL_ERROR}`;
}

function parseConfigEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  env: EnvironmentMap,
): z.infer<TSchema> {
  const result = schema.safeParse(env);

  if (!result.success) {
    throw new Error(formatConfigError(result.error));
  }

  return result.data;
}

/**
 * Creates the runtime server config. This intentionally excludes test-only
 * variables so production does not require integration test configuration.
 */
export function createAppConfig({
  env = process.env,
}: AppConfigDependencies = {}): AppConfig {
  const parsedEnv = parseConfigEnv(appConfigEnvSchema, env);

  return {
    database: {
      url: parsedEnv.DATABASE_URL,
    },
  };
}

/**
 * Returns the lazily parsed, cached runtime server config.
 */
export function getAppConfig(): AppConfig {
  cachedAppConfig ??= createAppConfig();

  return cachedAppConfig;
}

/**
 * Creates config for integration tests and one-off test database scripts.
 */
export function createTestAppConfig({
  env = process.env,
}: AppConfigDependencies = {}): TestAppConfig {
  const parsedEnv = parseConfigEnv(testAppConfigEnvSchema, env);

  return {
    database: {
      url: parsedEnv.TEST_DATABASE_URL,
    },
  };
}

/**
 * Clears the cached runtime config so tests can safely vary process.env.
 */
export function resetAppConfigForTests(): void {
  cachedAppConfig = null;
}
