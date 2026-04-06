import {
  createAppConfig,
  createTestAppConfig,
  type EnvironmentMap,
} from "@/libs/server/config";

/**
 * Reads the primary application database URL through the central server config.
 */
export function readDatabaseUrl(env: EnvironmentMap = process.env): string {
  return createAppConfig({ env }).database.url;
}

/**
 * Reads the dedicated test database URL through the central server config.
 */
export function readTestDatabaseUrl(env: EnvironmentMap = process.env): string {
  return createTestAppConfig({ env }).database.url;
}
