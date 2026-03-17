import type { FastifyInstance } from "fastify";
import prisma from "../lib/prisma";
import { requireAuth } from "../lib/security";

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/dashboard", { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.code(401).send({ message: "Usuario nao autenticado." });
    }

    const user = (await prisma.user.findUnique({
      where: { id: authUser.userId },
      include: {
        reportAccess: {
          include: {
            report: {
              include: {
                category: true
              }
            }
          }
        },
        filterRules: {
          orderBy: [{ reportId: "asc" }, { tableName: "asc" }, { columnName: "asc" }]
        }
      }
    } as any)) as any;

    if (!user || !user.active) {
      return reply.code(404).send({ message: "Usuario nao encontrado." });
    }

    const reports =
      user.role === "ADMIN"
        ? await prisma.report.findMany({
            where: { active: true },
            orderBy: [{ category: { sortOrder: "asc" } }, { category: { name: "asc" } }, { name: "asc" }],
            include: {
              category: true
            }
          } as any)
        : user.reportAccess
            .map(
              (access: {
                report: {
                  active: boolean;
                  id: number;
                  name: string;
                  description: string | null;
                  categoryId?: number | null;
                  category?: { id: number; name: string; color: string; sortOrder: number } | null;
                };
              }) => access.report
            )
            .filter((report: { active: boolean }) => report.active);

    const homeCards = await (prisma as any).homeCard.findMany({
      where:
        user.role === "ADMIN"
          ? {}
          : {
              active: true,
              accesses: {
                some: {
                  userId: user.id
                }
              }
            },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        profileLabel: user.profileLabel,
        role: user.role
      },
      summary: {
        reportsCount: reports.length,
        filtersCount: user.filterRules.length
      },
      homeCards: homeCards.map((card: any) => ({
        id: card.id,
        title: card.title,
        description: card.description,
        imageUrl: card.imageUrl,
        actionLabel: card.actionLabel,
        actionUrl: card.actionUrl,
        sortOrder: card.sortOrder,
        active: card.active
      })),
      categories: (reports as Array<{ category?: { id: number; name: string; color: string; sortOrder: number } | null }>)
        .map(
          (report) => report.category
        )
        .filter((category, index, list): category is { id: number; name: string; color: string; sortOrder: number } =>
          Boolean(category) && list.findIndex((item) => item?.id === category?.id) === index
        )
        .sort((a, b) => (a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder)),
      reports: reports.map(
        (report: {
          id: number;
          name: string;
          description: string | null;
          active: boolean;
          categoryId?: number | null;
          category?: { id: number; name: string; color: string; sortOrder: number } | null;
        }) => ({
        id: report.id,
        name: report.name,
        description: report.description,
        active: report.active,
        categoryId: report.categoryId ?? null,
        category: report.category
          ? {
              id: report.category.id,
              name: report.category.name,
              color: report.category.color,
              sortOrder: report.category.sortOrder
            }
          : null
      })
      ),
      filters: user.filterRules
    };
  });
}
