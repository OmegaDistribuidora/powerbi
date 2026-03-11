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
}
