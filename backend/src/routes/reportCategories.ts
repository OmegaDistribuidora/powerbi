import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { recordAudit } from "../lib/audit";
import { requireAdmin, requireAuth } from "../lib/security";

const categorySchema = z.object({
  name: z.string().min(2),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/, "Cor invalida."),
  sortOrder: z.number().int().min(0).default(0)
});

function serializeCategory(category: {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: Date;
  reports?: Array<{ id: number; name: string; active: boolean }>;
}) {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    reports: (category.reports || []).map((report) => ({
      id: report.id,
      name: report.name,
      active: report.active
    }))
  };
}

function serializeReportForDeletion(report: {
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
    embedUrl: report.embedUrl,
    active: report.active,
    categoryId: report.categoryId,
    category: report.category
      ? {
          id: report.category.id,
          name: report.category.name,
          color: report.category.color,
          sortOrder: report.category.sortOrder
        }
      : null,
    filterableFields: (report.filterableFields || []).map((field) => ({
      id: field.id,
      tableName: field.tableName,
      columnName: field.columnName
    }))
  };
}

export async function registerReportCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/report-categories", { preHandler: [requireAuth] }, async (request) => {
    const categories = await (prisma as any).reportCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: request.authUser?.role === "ADMIN" ? { reports: { orderBy: { name: "asc" } } } : undefined
    });

    return {
      categories: categories.map(serializeCategory)
    };
  });

  app.post("/api/report-categories", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = categorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message || "Dados da pasta invalidos." });
    }

    const existing = await (prisma as any).reportCategory.findUnique({
      where: { name: parsed.data.name.trim() }
    });
    if (existing) {
      return reply.code(409).send({ message: "Ja existe uma pasta com esse nome." });
    }

    const authUser = request.authUser;
    const category = await prisma.$transaction(async (tx: any) => {
      const created = await (tx as any).reportCategory.create({
        data: {
          name: parsed.data.name.trim(),
          color: parsed.data.color,
          sortOrder: parsed.data.sortOrder
        },
        include: {
          reports: {
            orderBy: { name: "asc" }
          }
        }
      });

      const serialized = serializeCategory(created);
      await recordAudit(
        {
          actor: authUser,
          action: "CREATE_CATEGORY",
          entityType: "CATEGORY",
          entityId: created.id,
          summary: `Pasta ${created.name} foi criada.`,
          before: null,
          after: serialized
        },
        tx
      );

      return created;
    });

    return reply.code(201).send({ category: serializeCategory(category) });
  });

  app.put("/api/report-categories/:id", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const categoryId = Number((request.params as { id?: string })?.id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return reply.code(400).send({ message: "Pasta invalida." });
    }

    const parsed = categorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message || "Dados da pasta invalidos." });
    }

    const current = await (prisma as any).reportCategory.findUnique({
      where: { id: categoryId },
      include: {
        reports: {
          orderBy: { name: "asc" }
        }
      }
    });
    if (!current) {
      return reply.code(404).send({ message: "Pasta nao encontrada." });
    }

    const existing = await (prisma as any).reportCategory.findUnique({
      where: { name: parsed.data.name.trim() }
    });
    if (existing && existing.id !== categoryId) {
      return reply.code(409).send({ message: "Ja existe uma pasta com esse nome." });
    }

    const authUser = request.authUser;
    const before = serializeCategory(current);
    const category = await prisma.$transaction(async (tx: any) => {
      const updated = await (tx as any).reportCategory.update({
        where: { id: categoryId },
        data: {
          name: parsed.data.name.trim(),
          color: parsed.data.color,
          sortOrder: parsed.data.sortOrder
        },
        include: {
          reports: {
            orderBy: { name: "asc" }
          }
        }
      });

      const after = serializeCategory(updated);
      await recordAudit(
        {
          actor: authUser,
          action: "UPDATE_CATEGORY",
          entityType: "CATEGORY",
          entityId: categoryId,
          summary: `Pasta ${updated.name} foi atualizada.`,
          before,
          after
        },
        tx
      );

      return updated;
    });

    return { category: serializeCategory(category) };
  });

  app.delete("/api/report-categories/:id", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const categoryId = Number((request.params as { id?: string })?.id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return reply.code(400).send({ message: "Categoria invalida." });
    }

    const current = await (prisma as any).reportCategory.findUnique({
      where: { id: categoryId },
      include: {
        reports: {
          include: {
            category: true,
            filterableFields: {
              orderBy: [{ tableName: "asc" }, { columnName: "asc" }]
            }
          },
          orderBy: { name: "asc" }
        }
      }
    });

    if (!current) {
      return reply.code(404).send({ message: "Categoria nao encontrada." });
    }

    const authUser = request.authUser;
    const before = serializeCategory(current);
    const deletedReports = current.reports.map(serializeReportForDeletion);

    await prisma.$transaction(async (tx: any) => {
      for (const report of deletedReports) {
        await recordAudit(
          {
            actor: authUser,
            action: "DELETE_REPORT",
            entityType: "REPORT",
            entityId: report.id,
            summary: `Painel ${report.name} foi excluido pela exclusao da categoria ${current.name}.`,
            before: report,
            after: null,
            metadata: {
              reason: "category-delete-cascade",
              categoryId: current.id,
              categoryName: current.name
            }
          },
          tx
        );

        await tx.report.delete({
          where: { id: report.id }
        });
      }

      await (tx as any).reportCategory.delete({
        where: { id: categoryId }
      });

      await recordAudit(
        {
          actor: authUser,
          action: "DELETE_CATEGORY",
          entityType: "CATEGORY",
          entityId: categoryId,
          summary: `Categoria ${current.name} foi excluida.`,
          before,
          after: null,
          metadata: {
            deletedReports: deletedReports.map((report: ReturnType<typeof serializeReportForDeletion>) => ({
              id: report.id,
              name: report.name
            }))
          }
        },
        tx
      );
    });

    return reply.code(204).send();
  });
}
