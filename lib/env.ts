import { z } from "zod";

/**
 * Startup environment validation.
 *
 * Two rules matter most here:
 *   1. Demo mode must keep working with ZERO configuration (it is a deliberate
 *      presentation capability), and
 *   2. a production server must never silently serve demo data or demo logins.
 *
 * `resolveEnv` is a pure function so the rules are testable; `env` is the
 * resolved singleton every server module should import.
 */

/**
 * Fixed secret used ONLY when NODE_ENV !== "production", so a fresh clone with
 * no .env.local can still sign in. Production rejects this exact value.
 */
export const DEV_ONLY_AUTH_SECRET = "haven-local-development-secret-v1";

const MIN_SECRET_LENGTH = 32;

/** Env files routinely contain `KEY=` — treat blank as absent. */
const blank = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const shape = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be an absolute URL").optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be an absolute URL").optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional()
});

export type DatabaseMode = "demo" | "supabase";

export interface Env {
  nodeEnv: "development" | "test" | "production";
  isProduction: boolean;
  authSecret: string;
  databaseMode: DatabaseMode;
  supabase: { url: string; serviceRoleKey: string } | null;
}

export class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "EnvironmentError";
  }
}

/** Loosened from NodeJS.ProcessEnv, which Next declares with a required NODE_ENV. */
type RawEnv = Record<string, string | undefined>;

export function resolveEnv(raw: RawEnv = process.env): Env {
  const parsed = shape.safeParse({
    NODE_ENV: blank(raw.NODE_ENV),
    NEXTAUTH_URL: blank(raw.NEXTAUTH_URL),
    NEXTAUTH_SECRET: blank(raw.NEXTAUTH_SECRET),
    NEXT_PUBLIC_SUPABASE_URL: blank(raw.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: blank(raw.SUPABASE_SERVICE_ROLE_KEY)
  });
  if (!parsed.success) throw new EnvironmentError(parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`));

  const value = parsed.data;
  const isProduction = value.NODE_ENV === "production";
  // `next build` runs with NODE_ENV=production. Deploy-time secrets are not
  // required to compile, so the production-only gates are enforced at serve
  // time instead — a misconfigured production server fails on boot, not silently.
  const isBuildPhase = blank(raw.NEXT_PHASE) === "phase-production-build";
  const enforceProduction = isProduction && !isBuildPhase;
  const problems: string[] = [];

  const url = value.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = value.SUPABASE_SERVICE_ROLE_KEY;
  if (Boolean(url) !== Boolean(serviceRoleKey)) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set together, or both left blank to run in demo mode.");
  }
  const databaseMode: DatabaseMode = url && serviceRoleKey ? "supabase" : "demo";

  let authSecret = value.NEXTAUTH_SECRET;
  if (enforceProduction) {
    if (!authSecret) problems.push("NEXTAUTH_SECRET is required in production. Generate one with: openssl rand -base64 32");
    else if (authSecret === DEV_ONLY_AUTH_SECRET) problems.push("NEXTAUTH_SECRET is still the development placeholder. Replace it with a unique random secret before deploying.");
    else if (authSecret.length < MIN_SECRET_LENGTH) problems.push(`NEXTAUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production (got ${authSecret.length}).`);

    if (databaseMode === "demo") problems.push("Production cannot run on in-memory demo data. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  } else if (!authSecret) {
    authSecret = DEV_ONLY_AUTH_SECRET;
  }

  if (problems.length) throw new EnvironmentError(problems);

  return {
    nodeEnv: value.NODE_ENV,
    isProduction,
    authSecret: authSecret ?? DEV_ONLY_AUTH_SECRET,
    databaseMode,
    supabase: url && serviceRoleKey ? { url, serviceRoleKey } : null
  };
}

export const env = resolveEnv();
