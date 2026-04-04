import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
const requiredVars = databaseUrl ? [] : ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missingVars = requiredVars.filter((name) => !process.env[name]);

if (missingVars.length > 0) {
  console.warn(`[db] Missing env vars: ${missingVars.join(", ")}`);
}

function buildSslConfig() {
  return process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false };
}

const poolConfig = {
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  ssl: buildSslConfig(),
};

if (databaseUrl) {
  poolConfig.connectionString = databaseUrl;
} else {
  poolConfig.host = process.env.DB_HOST;
  poolConfig.port = Number(process.env.DB_PORT || 5432);
  poolConfig.user = process.env.DB_USER;
  poolConfig.password = process.env.DB_PASSWORD;
  poolConfig.database = process.env.DB_NAME;
}

const pool = new Pool(poolConfig);

pool.on("error", (error) => {
  console.error("[db] Unexpected idle client error", error);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}

export function getConnectionInfo() {
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      return {
        mode: "DATABASE_URL",
        host: parsed.hostname || null,
        port: parsed.port || null,
      };
    } catch (_error) {
      return { mode: "DATABASE_URL", host: null, port: null };
    }
  }

  return {
    mode: "DB_FIELDS",
    host: process.env.DB_HOST || null,
    port: process.env.DB_PORT || null,
  };
}
