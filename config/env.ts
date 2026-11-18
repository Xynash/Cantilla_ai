import { envSchema } from "@/validations/env";

/**
 * Validates and exposes sanitized environment variables.
 * Safe fallback logic prevents build crashes when env vars are missing during static analysis.
 */
function getValidatedEnv() {
  const isServer = typeof window === "undefined";

  const rawEnv = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    MONGODB_URI: isServer ? process.env.MONGODB_URI : undefined,
    MONGODB_DB_NAME: isServer ? process.env.MONGODB_DB_NAME : undefined,
    AUTH_SECRET: isServer ? process.env.AUTH_SECRET : undefined,
    AUTH_URL: isServer ? process.env.AUTH_URL : undefined,
    ADMIN_EMAIL: isServer ? process.env.ADMIN_EMAIL : undefined,
    ADMIN_PASSWORD: isServer ? process.env.ADMIN_PASSWORD : undefined,
    ADMIN_NAME: isServer ? process.env.ADMIN_NAME : undefined,
  };

  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "❌ Invalid environment variables:",
        JSON.stringify(parsed.error.format(), null, 2)
      );
      throw new Error("Invalid environment variables");
    } else {
      return envSchema.parse({
        NODE_ENV: process.env.NODE_ENV ?? "development",
        NEXT_PUBLIC_APP_NAME: "Cantill.ai",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        MONGODB_URI: "mongodb://localhost:27017/cantill_db",
        MONGODB_DB_NAME: "cantill_db",
        AUTH_SECRET: "cantill_enterprise_auth_secret_placeholder_for_phase1",
        AUTH_URL: "http://localhost:3000",
        ADMIN_EMAIL: "admin@cantill.ai",
        ADMIN_PASSWORD: "CantillAdmin2026!",
        ADMIN_NAME: "Cantill System Administrator",
      });
    }
  }

  return parsed.data;
}

export const env = getValidatedEnv();
