import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAdmin, requireAuth } from "../lib/security";

const auditQuerySchema = z.object({
  kind: z.enum(["logins", "actions"]).default("actions"),
  period: z.enum(["today", "week"]).default("week"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

function buildPeriodWhere(period: "today" | "week") {
  const now = new Date();

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { gte: start, lte: now };
  }

  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { gte: start, lte: now };
}

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/audit", { preHandler: [requireAuth, requireAdmin] }, async (request) => {
    const query = auditQuerySchema.parse(request.query ?? {});
    const where = {
      createdAt: buildPeriodWhere(query.period),
      ...(query.kind === "logins" ? { action: "LOGIN" } : { action: { not: "LOGIN" } })
    } as const;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.offset,
        take: query.limit
      }),
      prisma.auditLog.count({ where })
    ]);

    return {
      logs: logs.map((log) => ({
        id: log.id,
        actorUserId: log.actorUserId,
        actorUsername: log.actorUsername,
        actorDisplayName: log.actorDisplayName,
        actorRole: log.actorRole,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        summary: log.summary,
        before: log.before,
        after: log.after,
        metadata: log.metadata,
        createdAt: log.createdAt
      })),
      total,
      offset: query.offset,
      limit: query.limit,
      hasMore: query.offset + logs.length < total
    };
  });
}
