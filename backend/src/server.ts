import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { env } from "./config";
import prisma from "./lib/prisma";
import { ensureAdminUser } from "./lib/seed";
import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerReportRoutes } from "./routes/reports";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerAuditRoutes } from "./routes/audit";
import { registerReportCategoryRoutes } from "./routes/reportCategories";
import { registerHomeCardRoutes } from "./routes/homeCards";
import type { AuthUser } from "./types";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

const app = Fastify({ logger: false });

async function bootstrap(): Promise<void> {
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024
    }
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerReportRoutes(app);
  await registerReportCategoryRoutes(app);
  await registerHomeCardRoutes(app);
  await registerDashboardRoutes(app);
  await registerAuditRoutes(app);

  if (env.previewsDir) {
    fs.mkdirSync(env.previewsDir, { recursive: true });
    await app.register(fastifyStatic, {
      root: env.previewsDir,
      prefix: "/previews/",
      decorateReply: false
    });
  }

  const frontendDist = path.resolve(__dirname, "..", "..", "frontend", "dist");
  if (fs.existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      wildcard: false
    });

    app.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ message: "Rota nao encontrada." });
      }

      return reply.sendFile("index.html");
    });
  }

  await prisma.$connect();
  await ensureAdminUser();

  await app.listen({
    port: env.port,
    host: "0.0.0.0"
  });
}

bootstrap().catch(async (error) => {
  console.error("Falha ao iniciar o backend:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
