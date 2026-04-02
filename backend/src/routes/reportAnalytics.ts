import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAdmin, requireAuth } from "../lib/security";

const FORTALEZA_TZ = "America/Fortaleza";
const DEFAULT_SESSION_MINUTES = 5;
const MAX_SESSION_MINUTES = 30;

const analyticsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

type ViewLog = {
  id: number;
  actorUserId: number | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  entityId: string | null;
  createdAt: Date;
  after: unknown;
};

function parseFortalezaDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00-03:00`);
  const end = new Date(`${endDate}T23:59:59.999-03:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error("Intervalo de datas inválido.");
  }

  return { start, end };
}

function formatFortalezaHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FORTALEZA_TZ,
      hour: "2-digit",
      hour12: false
    }).format(date)
  );
}

function formatFortalezaWeekday(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FORTALEZA_TZ,
    weekday: "long"
  }).format(date);
}

function extractReportName(log: ViewLog) {
  const after = log.after;
  if (after && typeof after === "object" && !Array.isArray(after) && "reportName" in after) {
    return String((after as { reportName?: unknown }).reportName || "Painel");
  }
  return "Painel";
}

function estimateSessionDurations(logs: ViewLog[]) {
  const byUser = new Map<number, ViewLog[]>();

  logs.forEach((log) => {
    if (log.actorUserId == null) {
      return;
    }

    if (!byUser.has(log.actorUserId)) {
      byUser.set(log.actorUserId, []);
    }
    byUser.get(log.actorUserId)?.push(log);
  });

  const durations = new Map<string, number[]>();

  byUser.forEach((userLogs) => {
    userLogs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    userLogs.forEach((log, index) => {
      const nextLog = userLogs[index + 1];
      const rawMinutes = nextLog
        ? (nextLog.createdAt.getTime() - log.createdAt.getTime()) / 60000
        : DEFAULT_SESSION_MINUTES;
      const estimatedMinutes = Math.max(1, Math.min(MAX_SESSION_MINUTES, Math.round(rawMinutes)));
      const reportKey = `${log.entityId || "unknown"}`;

      if (!durations.has(reportKey)) {
        durations.set(reportKey, []);
      }
      durations.get(reportKey)?.push(estimatedMinutes);
    });
  });

  return durations;
}

export async function registerReportAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/report-analytics", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    let parsed;

    try {
      parsed = analyticsQuerySchema.parse(request.query ?? {});
    } catch {
      return reply.code(400).send({ message: "Informe startDate e endDate no formato YYYY-MM-DD." });
    }

    let range;
    try {
      range = parseFortalezaDateRange(parsed.startDate, parsed.endDate);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Intervalo inválido." });
    }

    const viewLogs = await prisma.auditLog.findMany({
      where: {
        action: "VIEW_REPORT",
        createdAt: {
          gte: range.start,
          lte: range.end
        }
      },
      select: {
        id: true,
        actorUserId: true,
        actorUsername: true,
        actorDisplayName: true,
        entityId: true,
        createdAt: true,
        after: true
      },
      orderBy: { createdAt: "desc" }
    });

    const loginLogs = await prisma.auditLog.findMany({
      where: {
        action: "LOGIN",
        createdAt: {
          gte: range.start,
          lte: range.end
        }
      },
      select: {
        actorUserId: true
      }
    });

    const loginUsers = new Set(loginLogs.map((log) => log.actorUserId).filter((value): value is number => value != null));
    const viewUsers = new Set<number>();
    const reportRankingMap = new Map<string, { reportId: string; reportName: string; accesses: number }>();
    const accessesByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, accesses: 0 }));
    const weekdaySeed = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
    const accessesByWeekdayMap = new Map(weekdaySeed.map((weekday) => [weekday, 0]));
    const durationsByReport = estimateSessionDurations(viewLogs as ViewLog[]);

    viewLogs.forEach((log) => {
      if (log.actorUserId != null) {
        viewUsers.add(log.actorUserId);
      }

      const reportId = `${log.entityId || "unknown"}`;
      const reportName = extractReportName(log as ViewLog);
      const current = reportRankingMap.get(reportId) || { reportId, reportName, accesses: 0 };
      current.accesses += 1;
      reportRankingMap.set(reportId, current);

      const hour = formatFortalezaHour(log.createdAt);
      accessesByHour[hour].accesses += 1;

      const weekday = formatFortalezaWeekday(log.createdAt);
      accessesByWeekdayMap.set(weekday, (accessesByWeekdayMap.get(weekday) || 0) + 1);
    });

    const reportRanking = Array.from(reportRankingMap.values())
      .sort((a, b) => b.accesses - a.accesses || a.reportName.localeCompare(b.reportName))
      .map((report) => {
        const durations = durationsByReport.get(report.reportId) || [];
        const averageMinutes = durations.length
          ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10
          : null;

        return {
          ...report,
          averageMinutes
        };
      });

    const accessesByWeekday = weekdaySeed.map((weekday) => ({
      weekday,
      accesses: accessesByWeekdayMap.get(weekday) || 0
    }));

    const activeUsers = Array.from(viewUsers).filter((userId) => loginUsers.has(userId)).length;

    return {
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      summary: {
        activeUsers,
        totalViews: viewLogs.length,
        uniqueReports: reportRanking.length
      },
      reportRanking,
      averageTimeByReport: reportRanking.map((report) => ({
        reportId: report.reportId,
        reportName: report.reportName,
        averageMinutes: report.averageMinutes
      })),
      accessesByHour,
      accessesByWeekday
    };
  });
}
