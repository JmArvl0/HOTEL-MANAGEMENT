import { describe, expect, it, vi } from "vitest";
import { DEV_ONLY_AUTH_SECRET, EnvironmentError, resolveEnv } from "@/lib/env";

const SUPABASE = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_key" };
const PROD_SECRET = "a".repeat(32);

describe("resolveEnv — demo mode stays zero-config", () => {
  it("boots with an empty environment", () => {
    const env = resolveEnv({});
    expect(env.databaseMode).toBe("demo");
    expect(env.authSecret).toBe(DEV_ONLY_AUTH_SECRET);
    expect(env.supabase).toBeNull();
  });

  it("treats blank values as absent", () => {
    expect(resolveEnv({ NEXT_PUBLIC_SUPABASE_URL: "  ", SUPABASE_SERVICE_ROLE_KEY: "" }).databaseMode).toBe("demo");
  });
});

describe("resolveEnv — supabase mode", () => {
  it("switches mode when both variables are present", () => {
    const env = resolveEnv(SUPABASE);
    expect(env.databaseMode).toBe("supabase");
    expect(env.supabase).toEqual({ url: SUPABASE.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey: SUPABASE.SUPABASE_SERVICE_ROLE_KEY });
  });

  it("rejects a half-configured pair", () => {
    expect(() => resolveEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE.NEXT_PUBLIC_SUPABASE_URL })).toThrow(EnvironmentError);
    expect(() => resolveEnv({ SUPABASE_SERVICE_ROLE_KEY: "sb_secret_x" })).toThrow(EnvironmentError);
  });

  it("rejects a malformed url", () => {
    expect(() => resolveEnv({ ...SUPABASE, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })).toThrow(EnvironmentError);
  });
});

describe("resolveEnv — production refuses insecure configuration", () => {
  const prod = (extra: Record<string, string | undefined> = {}) => resolveEnv({ NODE_ENV: "production", ...SUPABASE, NEXTAUTH_SECRET: PROD_SECRET, ...extra });

  it("accepts a fully configured production environment", () => {
    const env = prod();
    expect(env.isProduction).toBe(true);
    expect(env.databaseMode).toBe("supabase");
  });

  it("refuses to fall back to demo data", () => {
    expect(() => resolveEnv({ NODE_ENV: "production", NEXTAUTH_SECRET: PROD_SECRET })).toThrow(/demo data/);
  });

  it("requires a real NEXTAUTH_SECRET", () => {
    expect(() => prod({ NEXTAUTH_SECRET: undefined })).toThrow(/NEXTAUTH_SECRET is required/);
    expect(() => prod({ NEXTAUTH_SECRET: DEV_ONLY_AUTH_SECRET })).toThrow(/development placeholder/);
    expect(() => prod({ NEXTAUTH_SECRET: "short" })).toThrow(/at least 32 characters/);
  });

  it("defers production gates during next build so demo mode still compiles", () => {
    const env = resolveEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" });
    expect(env.databaseMode).toBe("demo");
  });

  it("fails at import time, so a misconfigured server cannot boot", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(import("@/lib/env")).rejects.toThrow(/demo data/);
    vi.unstubAllEnvs();
  });
});
