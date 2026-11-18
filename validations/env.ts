import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Cantill.ai"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  
  // Database configuration (Server-only)
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .default("mongodb://localhost:27017/cantill_db"),
  MONGODB_DB_NAME: z.string().default("cantill_db"),

  // Authentication configuration (Server-only)
  AUTH_SECRET: z
    .string()
    .min(16, "AUTH_SECRET should be at least 16 characters")
    .default("cantill_enterprise_auth_secret_placeholder_for_phase1"),
  AUTH_URL: z.string().url().default("http://localhost:3000"),

  // Initial Administrator Bootstrap (Server-only)
  ADMIN_EMAIL: z.string().email().default("admin@cantill.ai"),
  ADMIN_PASSWORD: z.string().min(8).default("CantillAdmin2026!"),
  ADMIN_NAME: z.string().default("Cantill System Administrator"),
});

export type Env = z.infer<typeof envSchema>;
