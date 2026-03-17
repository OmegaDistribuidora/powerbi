import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "backend", ".env")
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "change-me",
  databaseUrl: process.env.DATABASE_URL || "",
  adminUsername: String(process.env.ADMIN_USERNAME || "admin").trim().toLowerCase(),
  adminPassword: String(process.env.ADMIN_PASSWORD || "Omega@123"),
  adminDisplayName: String(process.env.ADMIN_DISPLAY_NAME || "Administrador").trim(),
  previewsDir: String(process.env.PREVIEWS_DIR || "/previews").trim()
};
