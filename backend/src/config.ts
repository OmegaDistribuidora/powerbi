import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

function parseNormalizedList(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isUnsafePlaceholder(value: string | null, placeholders: string[]): boolean {
  if (!value) {
    return true;
  }

  return placeholders.includes(value.trim().toLowerCase());
}

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

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const rawJwtSecret = readOptionalEnv("JWT_SECRET");
const rawAdminPassword = readOptionalEnv("ADMIN_PASSWORD");

function resolveJwtSecret(): string {
  if (!isUnsafePlaceholder(rawJwtSecret, ["change-me"])) {
    return rawJwtSecret as string;
  }

  if (isProduction) {
    throw new Error("JWT_SECRET deve ser definido com um valor forte em producao.");
  }

  const generatedSecret = crypto.randomBytes(32).toString("hex");
  console.warn("[config] JWT_SECRET ausente ou inseguro fora de producao. Um segredo temporario foi gerado para esta execucao.");
  return generatedSecret;
}

let generatedAdminPassword: string | null = null;

export function resolveAdminBootstrapPassword(): string {
  if (!isUnsafePlaceholder(rawAdminPassword, ["omega@123"])) {
    return rawAdminPassword as string;
  }

  if (isProduction) {
    throw new Error("ADMIN_PASSWORD deve ser definido com um valor forte em producao.");
  }

  if (!generatedAdminPassword) {
    generatedAdminPassword = crypto.randomBytes(18).toString("base64url");
    console.warn(
      `[config] ADMIN_PASSWORD ausente ou inseguro fora de producao. Senha temporaria do admin inicial: ${generatedAdminPassword}`
    );
  }

  return generatedAdminPassword;
}

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv,
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: readOptionalEnv("JWT_EXPIRES_IN") || "1h",
  databaseUrl: process.env.DATABASE_URL || "",
  adminUsername: String(process.env.ADMIN_USERNAME || "admin").trim().toLowerCase(),
  adminDisplayName: String(process.env.ADMIN_DISPLAY_NAME || "Administrador").trim(),
  previewsDir: String(process.env.PREVIEWS_DIR || "/previews").trim(),
  ecosystemSso: {
    issuer: String(process.env.ECOSYSTEM_SSO_ISSUER || "ecosistema-omega").trim(),
    audience: String(process.env.ECOSYSTEM_SSO_AUDIENCE || "powerbi").trim(),
    sharedSecret: String(process.env.ECOSYSTEM_SSO_SHARED_SECRET || "").trim(),
    adminUsers: parseNormalizedList(process.env.ECOSYSTEM_SSO_ADMIN_USERS)
  }
};
