import dotenv from "dotenv";
import app from "./app.js";
import { closePool, getConnectionInfo, testConnection } from "./db.js";

dotenv.config();

const port = Number(process.env.PORT || 4000);
const connectionInfo = getConnectionInfo();
console.log(
  `[api] DB config mode: ${connectionInfo.mode} ${connectionInfo.host ? `(${connectionInfo.host})` : ""}`,
);

function printConnectionHint(error) {
  const message = (error?.message || "").toLowerCase();
  const isDnsError = message.includes("enotfound") || message.includes("eai_again");
  const host = connectionInfo.host || "";

  if (!isDnsError) {
    return;
  }

  if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
    console.error(
      "[api] Hint: this direct Supabase host is IPv6-only in many setups. Use Supabase Session Pooler (IPv4) in DATABASE_URL.",
    );
    console.error(
      "[api] In Supabase dashboard: Connect > ORMs > Node.js, copy the Session Pooler URI and paste into .env as DATABASE_URL.",
    );
    console.error("[api] Then remove/comment DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME and restart server.");
  }
}

const server = app.listen(port, async () => {
  console.log(`[api] Note backend listening on http://localhost:${port}`);
  try {
    await testConnection();
    console.log("[api] Database connection successful.");
  } catch (error) {
    const errorLabel = [error?.code, error?.message].filter(Boolean).join(" ") || String(error);
    console.error("[api] Database connection failed:", errorLabel);
    console.error("[api] Run SQL setup first and verify your .env credentials.");
    printConnectionHint(error);
  }
});

async function shutdown(signal) {
  console.log(`[api] Received ${signal}. Shutting down...`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
