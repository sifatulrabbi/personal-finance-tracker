import { z } from "zod";

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3001"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().url(),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.string().default("5432"),
  DB_NAME: z.string().default("finance_tracker"),
  DB_USER: z.string().default("postgres"),
  DB_PASSWORD: z.string(),
  DB_POOL_MIN: z.string().default("2"),
  DB_POOL_MAX: z.string().default("10"),

  // Authentication
  AUTH_USERNAME: z.string().min(1),
  AUTH_PASSWORD: z.string().min(8),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),
});

type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Invalid environment variables:");
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

const env = validateEnv();

export const config = {
  nodeEnv: env.NODE_ENV,
  port: parseInt(env.PORT, 10),
  corsOrigin: env.CORS_ORIGIN,

  database: {
    url: env.DATABASE_URL,
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT, 10),
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    poolMin: parseInt(env.DB_POOL_MIN, 10),
    poolMax: parseInt(env.DB_POOL_MAX, 10),
  },

  auth: {
    username: env.AUTH_USERNAME,
    password: env.AUTH_PASSWORD,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
  },
} as const;
