import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { hashPassword, requireAdmin, requireAuth } from "../lib/security";
import type { AppUserRole } from "../types";

const filterRuleSchema = z.object({
  reportId: z.number().int().positive().nullable().optional(),
  tableName: z.string().min(1),
  columnName: z.string().min(1),
  value: z.string().min(1)
});

const createUserSchema = z.object({
  username: z.string().min(2),
  displayName: z.string().min(2),
  profileLabel: z.string().optional().nullable(),
  password: z.string().min(3),
  role: z.enum(["ADMIN", "USER"]),
  active: z.boolean().default(true),
  reportIds: z.array(z.number().int().positive()).default([]),
  filterRules: z.array(filterRuleSchema).default([])
});

const updateUserSchema = createUserSchema.extend({
  password: z.string().min(3).optional().or(z.literal(""))
});

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

async function validateFilterRules(
  reportIds: number[],
  filterRules: Array<{ reportId?: number | null; tableName: string; columnName: string }>,
  tx: typeof prisma
): Promise<boolean> {
  if (!filterRules.length) {
    return true;
  }

  const allowedByReportIds = new Set<number>();
  reportIds.forEach((reportId) => allowedByReportIds.add(reportId));
  filterRules.forEach((rule) => {
    if (rule.reportId) {
      allowedByReportIds.add(rule.reportId);
    }
  });

  const reportIdList = Array.from(allowedByReportIds);
  if (!reportIdList.length) {
    return false;
  }

  const allowedFields = await tx.reportFilterField.findMany({
    where: {
      reportId: {
        in: reportIdList
      }
    },
    select: {
      reportId: true,
      tableName: true,
      columnName: true
    }
  });

  const byReport = new Map<number, Set<string>>();
  for (const field of allowedFields) {
    if (!byReport.has(field.reportId)) {
      byReport.set(field.reportId, new Set());
    }
    byReport.get(field.reportId)?.add(`${field.tableName}::${field.columnName}`);
  }

  return filterRules.every((rule) => {
    const key = `${rule.tableName.trim()}::${rule.columnName.trim()}`;
    if (rule.reportId) {
      return byReport.get(rule.reportId)?.has(key) || false;
    }

    return reportIds.some((reportId) => byReport.get(reportId)?.has(key));
  });
}

function serializeUser(user: {
  id: number;
  username: string;
  displayName: string;
  profileLabel: string | null;
  role: AppUserRole;
  active: boolean;
  createdAt: Date;
  reportAccess: Array<{ reportId: number }>;
  filterRules: Array<{
    id: number;
    reportId: number | null;
    tableName: string;
    columnName: string;
    value: string;
  }>;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    profileLabel: user.profileLabel,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    reportIds: user.reportAccess.map((item) => item.reportId),
    filterRules: user.filterRules
  };
}

function userAuditSnapshot(user: ReturnType<typeof serializeUser>) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    profileLabel: user.profileLabel,
    role: user.role,
    active: user.active,
    reportIds: user.reportIds,
    filterRules: user.filterRules.map((rule) => ({
      id: rule.id,
      reportId: rule.reportId,
      tableName: rule.tableName,
      columnName: rule.columnName,
      value: rule.value
    }))
  };
}

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/users", { preHandler: [requireAuth, requireAdmin] }, async () => {
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { username: "asc" }],
      include: {
        reportAccess: {
          select: {
            reportId: true
          }
        },
        filterRules: {
          orderBy: [{ reportId: "asc" }, { tableName: "asc" }, { columnName: "asc" }]
        }
      }
    });

    return {
      users: users.map(serializeUser)
    };
  });

  app.post("/api/users", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Dados do usuario invalidos." });
    }

    const username = normalizeUsername(parsed.data.username);
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return reply.code(409).send({ message: "Ja existe um usuario com esse login." });
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const rulesAreValid = await validateFilterRules(parsed.data.reportIds, parsed.data.filterRules, prisma);
    if (!rulesAreValid) {
      return reply.code(400).send({ message: "As regras de filtro nao correspondem aos campos permitidos dos paineis." });
    }

    const authUser = request.authUser;
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          displayName: parsed.data.displayName.trim(),
          profileLabel: parsed.data.profileLabel?.trim() || null,
          passwordHash,
          role: parsed.data.role,
          active: parsed.data.active
        }
      });

      if (parsed.data.reportIds.length) {
        await tx.userReportAccess.createMany({
          data: parsed.data.reportIds.map((reportId) => ({
            userId: user.id,
            reportId
          })),
          skipDuplicates: true
        });
      }

      if (parsed.data.filterRules.length) {
        await tx.filterRule.createMany({
          data: parsed.data.filterRules.map((rule) => ({
            userId: user.id,
            reportId: rule.reportId ?? null,
            tableName: rule.tableName.trim(),
            columnName: rule.columnName.trim(),
            value: rule.value.trim()
          }))
        });
      }

      const createdUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          reportAccess: { select: { reportId: true } },
          filterRules: true
        }
      });

      const serializedUser = serializeUser(createdUser);
      await recordAudit(
        {
          actor: authUser,
          action: "CREATE_USER",
          entityType: "USER",
          entityId: user.id,
          summary: `${serializedUser.displayName} foi criado.`,
          before: null,
          after: userAuditSnapshot(serializedUser)
        },
        tx
      );

      return createdUser;
    });

    return reply.code(201).send({ user: serializeUser(created) });
  });

  app.put("/api/users/:id", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const userId = Number(request.params && (request.params as { id: string }).id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return reply.code(400).send({ message: "Usuario invalido." });
    }

    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Dados do usuario invalidos." });
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        reportAccess: { select: { reportId: true } },
        filterRules: true
      }
    });
    if (!current) {
      return reply.code(404).send({ message: "Usuario nao encontrado." });
    }

    const username = normalizeUsername(parsed.data.username);
    const owner = await prisma.user.findUnique({ where: { username } });
    if (owner && owner.id !== userId) {
      return reply.code(409).send({ message: "Ja existe um usuario com esse login." });
    }

    const rulesAreValid = await validateFilterRules(parsed.data.reportIds, parsed.data.filterRules, prisma);
    if (!rulesAreValid) {
      return reply.code(400).send({ message: "As regras de filtro nao correspondem aos campos permitidos dos paineis." });
    }

    const authUser = request.authUser;
    const beforeSnapshot = userAuditSnapshot(serializeUser(current));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          username,
          displayName: parsed.data.displayName.trim(),
          profileLabel: parsed.data.profileLabel?.trim() || null,
          role: parsed.data.role,
          active: parsed.data.active,
          ...(parsed.data.password && parsed.data.password.trim()
            ? { passwordHash: await hashPassword(parsed.data.password.trim()) }
            : {})
        }
      });

      await tx.userReportAccess.deleteMany({ where: { userId } });
      if (parsed.data.reportIds.length) {
        await tx.userReportAccess.createMany({
          data: parsed.data.reportIds.map((reportId) => ({
            userId,
            reportId
          })),
          skipDuplicates: true
        });
      }

      await tx.filterRule.deleteMany({ where: { userId } });
      if (parsed.data.filterRules.length) {
        await tx.filterRule.createMany({
          data: parsed.data.filterRules.map((rule) => ({
            userId,
            reportId: rule.reportId ?? null,
            tableName: rule.tableName.trim(),
            columnName: rule.columnName.trim(),
            value: rule.value.trim()
          }))
        });
      }

      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          reportAccess: { select: { reportId: true } },
          filterRules: true
        }
      });

      const serializedUser = serializeUser(updatedUser);
      await recordAudit(
        {
          actor: authUser,
          action: "UPDATE_USER",
          entityType: "USER",
          entityId: userId,
          summary: `${serializedUser.displayName} foi atualizado.`,
          before: beforeSnapshot,
          after: userAuditSnapshot(serializedUser)
        },
        tx
      );

      return updatedUser;
    });

    return { user: serializeUser(updated) };
  });
}
