const DATABASE_URL_ENV_KEY = "DATABASE_URL";
const TEST_DATABASE_URL_ENV_KEY = "TEST_DATABASE_URL";

type EnvironmentMap = Record<string, string | undefined>;

function readRequiredEnvironmentValue(
  env: EnvironmentMap,
  key: string,
  message: string,
): string {
  const value = env[key];

  if (!value) {
    throw new Error(message);
  }

  return value;
}

/**
 * Reads the primary application database URL.
 */
export function readDatabaseUrl(env: EnvironmentMap = process.env): string {
  return readRequiredEnvironmentValue(
    env,
    DATABASE_URL_ENV_KEY,
    "DATABASE_URL is required to connect to the application database.",
  );
}

/**
 * Reads the dedicated test database URL used by integration tests.
 */
export function readTestDatabaseUrl(env: EnvironmentMap = process.env): string {
  return readRequiredEnvironmentValue(
    env,
    TEST_DATABASE_URL_ENV_KEY,
    "TEST_DATABASE_URL is required to connect to the integration test database.",
  );
}
