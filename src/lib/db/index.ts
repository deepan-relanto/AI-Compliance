import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type SqlClient = NeonQueryFunction<false, false>;

declare global {
  var __complianceSql: SqlClient | undefined;
}

function readEnvUrl(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

/** Prefer DATABASE_POOL_URL on EC2 / always-on hosts. */
export function getDatabaseUrl(): string {
  const pooled = readEnvUrl("DATABASE_POOL_URL");
  if (pooled) return pooled;

  const direct = readEnvUrl("DATABASE_URL", "postgres_neon", "POSTGRES_NEON");
  if (!direct) {
    throw new Error(
      "Missing DATABASE_URL (or postgres_neon) in environment variables.",
    );
  }

  if (
    direct.includes(".neon.tech") &&
    !direct.includes("-pooler") &&
    process.env.DATABASE_USE_POOLER !== "false"
  ) {
    return direct.replace(/@([^.]+)\./, "@$1-pooler.");
  }

  return direct;
}

/** One shared client per Node process — avoids reconnect overhead on EC2. */
export function getSql(): SqlClient {
  if (!globalThis.__complianceSql) {
    globalThis.__complianceSql = neon(getDatabaseUrl());
  }
  return globalThis.__complianceSql;
}
