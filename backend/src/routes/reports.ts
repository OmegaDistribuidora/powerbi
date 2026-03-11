import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { requireAdmin, requireAuth } from "../lib/security";

const reportSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  workspaceId: z.string().optional().nullable(),
  reportKey: z.string().optional().nullable(),
  datasetId: z.string().optional().nullable(),
  categoryId: z.number().int().positive().nullable().optional(),
  embedUrl: z.string().url().optional().nullable().or(z.literal("")),
  filterableFields: z
    .array(
      z.object({
        tableName: z.string().min(1),
        columnName: z.string().min(1)
      })
    )
    .default([]),
  active: z.boolean().default(true)
});

function serializeReport(report: {
  id: number;
  name: string;
  description: string | null;
  workspaceId: string | null;
  reportKey: string | null;
  datasetId: string | null;
  embedUrl: string | null;
  active: boolean;
  createdAt: Date;
  categoryId: number | null;
  category?: {
    id: number;
    name: string;
    color: string;
    sortOrder: number;
  } | null;
  filterableFields?: Array<{
    id: number;
    tableName: string;
    columnName: string;
  }>;
}) {
  return {
    id: report.id,
    name: report.name,
    description: report.description,
    workspaceId: report.workspaceId,
    reportKey: report.reportKey,
    datasetId: report.datasetId,
    categoryId: report.categoryId,
    category: report.category
      ? {
          id: report.category.id,
          name: report.category.name,
          color: report.category.color,
          sortOrder: report.category.sortOrder
        }
      : null,
    embedUrl: report.embedUrl,
    filterableFields: (report.filterableFields || []).map((field) => ({
      id: field.id,
      tableName: field.tableName,
      columnName: field.columnName
    })),
    active: report.active,
    createdAt: report.createdAt
  };
}

function reportAuditSnapshot(report: ReturnType<typeof serializeReport>) {
  return {
    id: report.id,
    name: report.name,
    description: report.description,
    workspaceId: report.workspaceId,
    reportKey: report.reportKey,
    datasetId: report.datasetId,
    categoryId: report.categoryId,
    category: report.category,
    embedUrl: report.embedUrl,
    active: report.active,
    filterableFields: report.filterableFields.map((field) => ({
      id: field.id,
      tableName: field.tableName,
      columnName: field.columnName
    }))
  };
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/reports", { preHandler: [requireAuth] }, async (request) => {
    if (request.authUser?.role === "ADMIN") {
      const reports = await prisma.report.findMany({
        orderBy: { name: "asc" },
        include: {
          category: true,
          filterableFields: {
            orderBy: [{ tableName: "asc" }, { columnName: "asc" }]
          }
        }
      } as any);
      return { reports: reports.map(serializeReport) };
    }

    const access = await prisma.userReportAccess.findMany({
      where: {
        userId: request.authUser?.userId,
        report: {
          active: true
        }
      },
      include: {
        report: {
          include: {
            category: true,
            filterableFields: {
              orderBy: [{ tableName: "asc" }, { columnName: "asc" }]
            }
          }
        }
      },
      orderBy: {
        report: {
          name: "asc"
        }
      }
    } as any);

    return {
      reports: ((access as unknown) as Array<{ report: Parameters<typeof serializeReport>[0] }>).map((item) =>
        serializeReport(item.report)
      )
    };
  });

  app.post("/api/reports", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Dados do painel invalidos." });
    }

    const authUser = request.authUser;
    const report = await prisma.$transaction(async (tx) => {
      const createdReport = await tx.report.create({
        data: {
          name: parsed.data.name.trim(),
          description: parsed.data.description?.trim() || null,
          workspaceId: parsed.data.workspaceId?.trim() || null,
          reportKey: parsed.data.reportKey?.trim() || null,
          datasetId: parsed.data.datasetId?.trim() || null,
          categoryId: parsed.data.categoryId ?? null,
          embedUrl: parsed.data.embedUrl?.trim() || null,
          filterableFields: {
            create: parsed.data.filterableFields.map((field) => ({
              tableName: field.tableName.trim(),
              columnName: field.columnName.trim()
            }))
          },
          active: parsed.data.active
        },
        include: {
          category: true,
          filterableFields: {
            orderBy: [{ tableName: "asc" }, { columnName: "asc" }]
          }
        }
      } as any);

      const serializedReport = serializeReport(createdReport);
      await recordAudit(
        {
          actor: authUser,
          action: "CREATE_REPORT",
          entityType: "REPORT",
          entityId: createdReport.id,
          summary: `Painel ${serializedReport.name} foi criado.`,
          before: null,
          after: reportAuditSnapshot(serializedReport)
        },
        tx
      );

      return createdReport;
    });

    return reply.code(201).send({ report: serializeReport(report) });
  });

  app.put("/api/reports/:id", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const reportId = Number(request.params && (request.params as { id: string }).id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return reply.code(400).send({ message: "Painel invalido." });
    }

    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Dados do painel invalidos." });
    }

    const current = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        category: true,
        filterableFields: {
          orderBy: [{ tableName: "asc" }, { columnName: "asc" }]
        }
      }
    } as any);
    if (!current) {
      return reply.code(404).send({ message: "Painel nao encontrado." });
    }

    const authUser = request.authUser;
    const beforeSnapshot = reportAuditSnapshot(serializeReport(current));
    const report = await prisma.$transaction(async (tx) => {
      const updatedReport = await tx.report.update({
        where: { id: reportId },
        data: {
          name: parsed.data.name.trim(),
          description: parsed.data.description?.trim() || null,
          workspaceId: parsed.data.workspaceId?.trim() || null,
          reportKey: parsed.data.reportKey?.trim() || null,
          datasetId: parsed.data.datasetId?.trim() || null,
          categoryId: parsed.data.categoryId ?? null,
          embedUrl: parsed.data.embedUrl?.trim() || null,
          filterableFields: {
            deleteMany: {},
            create: parsed.data.filterableFields.map((field) => ({
              tableName: field.tableName.trim(),
              columnName: field.columnName.trim()
            }))
          },
          active: parsed.data.active
        },
        include: {
          category: true,
          filterableFields: {
            orderBy: [{ tableName: "asc" }, { columnName: "asc" }]
          }
        }
      } as any);

      const serializedReport = serializeReport(updatedReport);
      await recordAudit(
        {
          actor: authUser,
          action: "UPDATE_REPORT",
          entityType: "REPORT",
          entityId: reportId,
          summary: `Painel ${serializedReport.name} foi atualizado.`,
          before: beforeSnapshot,
          after: reportAuditSnapshot(serializedReport)
        },
        tx
      );

      return updatedReport;
    });

    return { report: serializeReport(report) };
  });

  app.get("/api/reports/:id/view", { preHandler: [requireAuth] }, async (request, reply) => {
    const reportId = Number(request.params && (request.params as { id: string }).id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return reply.code(400).send({ message: "Painel invalido." });
    }

    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ message: "Usuario nao autenticado." });
    }

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        category: true,
        filterableFields: {
          orderBy: [{ tableName: "asc" }, { columnName: "asc" }]
        }
      }
    } as any);

    if (!report || !report.active) {
      return reply.code(404).send({ message: "Painel nao encontrado." });
    }

    if (authUser.role !== "ADMIN") {
      const access = await prisma.userReportAccess.findUnique({
        where: {
          userId_reportId: {
            userId: authUser.userId,
            reportId
          }
        }
      });

      if (!access) {
        return reply.code(403).send({ message: "Sem acesso a este painel." });
      }
    }

    const filterRules = await prisma.filterRule.findMany({
      where: {
        userId: authUser.userId,
        OR: [{ reportId: null }, { reportId }]
      },
      orderBy: [{ reportId: "asc" }, { tableName: "asc" }, { columnName: "asc" }]
    });

    await recordAudit({
      actor: authUser,
      action: "VIEW_REPORT",
      entityType: "REPORT",
      entityId: reportId,
      summary: `${authUser.username} abriu o painel ${report.name}.`,
      before: null,
      after: {
        reportId,
        reportName: report.name,
        filters: filterRules.map((rule) => ({
          id: rule.id,
          reportId: rule.reportId,
          tableName: rule.tableName,
          columnName: rule.columnName,
          value: rule.value
        }))
      }
    });

    return {
      report: serializeReport(report),
      filters: filterRules
    };
  });
}
