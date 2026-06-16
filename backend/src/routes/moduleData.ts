import type { FastifyInstance } from "fastify";
import prisma from "../lib/prisma";
import { requireModuleAccess } from "../lib/modules";
import { requireAuth } from "../lib/security";

export async function registerModuleDataRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/module-data/mapping", { preHandler: [requireAuth, requireModuleAccess("MAPPING")] }, async () => {
    const [reports, users, categories] = await Promise.all([
      prisma.report.findMany({
        orderBy: [{ category: { sortOrder: "asc" } }, { category: { name: "asc" } }, { name: "asc" }],
        include: {
          category: true
        }
      } as any),
      prisma.user.findMany({
        where: { role: "USER" },
        orderBy: [{ active: "desc" }, { displayName: "asc" }],
        include: {
          reportAccess: {
            select: { reportId: true }
          }
        }
      }),
      (prisma as any).reportCategory.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      })
    ]);

    return {
      reports: reports.map((report: any) => ({
        id: report.id,
        name: report.name,
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
      })),
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        profileLabel: user.profileLabel,
        active: user.active,
        reportIds: user.reportAccess.map((access) => access.reportId)
      })),
      categories: categories.map((category: any) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        sortOrder: category.sortOrder
      }))
    };
  });
}
