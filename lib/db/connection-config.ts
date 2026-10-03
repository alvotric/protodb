import type { PoolConfig } from "pg";

export interface DatabaseTarget {
  host: string;
  port: number;
  database: string;
}

export type DatabaseEnvironment = Record<string, string | undefined>;

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

export class DdlTargetMismatchError extends Error {
  constructor() {
    super("The DDL database target could not be verified as the configured database. Schema changes are disabled.");
    this.name = "DdlTargetMismatchError";
  }
}

function readBoolean(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "") return false;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  throw new DatabaseConfigurationError(`${name} must be set to true or false.`);
}

export function parseDatabaseTarget(connectionString: string): DatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new DatabaseConfigurationError("The database connection configuration is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
    throw new DatabaseConfigurationError("The database connection configuration is invalid.");
  }
  if (["sslmode", "sslrootcert", "sslcert", "sslkey"].some((key) => parsed.searchParams.has(key))) {
    throw new DatabaseConfigurationError("Configure PostgreSQL TLS with the documented environment variables, not URL options.");
  }
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new DatabaseConfigurationError("The database connection port is invalid.");
  }
  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new DatabaseConfigurationError("The database name in the connection configuration is invalid.");
  }
  if (!database) throw new DatabaseConfigurationError("The database name in the connection configuration is invalid.");
  return { host: parsed.hostname.toLowerCase(), port, database };
}

export function targetsMatch(left: DatabaseTarget, right: DatabaseTarget): boolean {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

export function createDatabasePoolConfig(
  urlName: "DATABASE_URL" | "DATABASE_DDL_URL",
  sslName: "DATABASE_SSL" | "DATABASE_DDL_SSL",
  caName: "DATABASE_SSL_CA" | "DATABASE_DDL_SSL_CA",
  developmentSelfSignedName: "DATABASE_SSL_ALLOW_SELF_SIGNED" | "DATABASE_DDL_SSL_ALLOW_SELF_SIGNED",
  env: DatabaseEnvironment = process.env
): PoolConfig {
  const connectionString = env[urlName];
  if (!connectionString) throw new DatabaseConfigurationError(`${urlName} is not configured.`);
  parseDatabaseTarget(connectionString);

  const sslEnabled = readBoolean(env[sslName], sslName);
  const allowSelfSigned = readBoolean(env[developmentSelfSignedName], developmentSelfSignedName);
  const ca = env[caName];
  const nodeEnv = env.NODE_ENV ?? "development";
  if (ca && !sslEnabled) {
    throw new DatabaseConfigurationError(`${caName} requires ${sslName}=true.`);
  }
  if (allowSelfSigned && (!sslEnabled || nodeEnv === "production")) {
    throw new DatabaseConfigurationError(`${developmentSelfSignedName} is permitted only for explicit non-production TLS.`);
  }
  if (ca && !ca.includes("-----BEGIN CERTIFICATE-----")) {
    throw new DatabaseConfigurationError(`${caName} must contain a PEM CA certificate.`);
  }

  return {
    connectionString,
    ssl: sslEnabled
      ? {
          rejectUnauthorized: !allowSelfSigned,
          ...(ca ? { ca } : {}),
        }
      : false,
  };
}
