import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fetchGestaoVendasReportUsers, fetchGestaoVendasUsageReport } from "../lib/gestaoVendasReports";
import { requireModuleAccess } from "../lib/modules";
import { requireAuth } from "../lib/security";

const reportQuerySchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  userId: z.string().uuid().optional(),
  coordinatorCode: z.string().max(40).optional(),
  profileSlugs: z.string().max(300).optional()
});

export async function registerGestaoVendasReportRoutes(app: FastifyInstance): Promise<void> {
  const guards = [requireAuth, requireModuleAccess("GESTAO_VENDAS_REPORTS")];

  app.get("/api/gestao-vendas-reports/users", { preHandler: guards }, async (_request, reply) => {
    try {
      return { users: await fetchGestaoVendasReportUsers() };
    } catch (error) {
      app.log.error(error);
      return reply.code(502).send({ message: error instanceof Error ? error.message : "Falha ao consultar usuários." });
    }
  });

  app.get("/api/gestao-vendas-reports/usage", { preHandler: guards }, async (request, reply) => {
    const parsed = reportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Filtros do relatório inválidos." });
    }
    const profileSlugs = String(parsed.data.profileSlugs || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      const report = await fetchGestaoVendasUsageReport({
        start: parsed.data.start,
        end: parsed.data.end,
        userId: parsed.data.userId,
        coordinatorCode: parsed.data.coordinatorCode,
        profileSlugs
      });
      return { report };
    } catch (error) {
      app.log.error(error);
      return reply.code(502).send({ message: error instanceof Error ? error.message : "Falha ao consultar relatório." });
    }
  });
}
