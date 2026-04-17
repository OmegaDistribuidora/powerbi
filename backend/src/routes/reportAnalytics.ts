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

type ReportRef = {
  id: number;
  name: string;
  category: {
    id: number;
    name: string;
  } | null;
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
  const byUser = new Map<string, ViewLog[]>();

  logs.forEach((log) => {
    const actorKey = log.actorUserId != null ? `id:${log.actorUserId}` : log.actorUsername ? `username:${log.actorUsername}` : null;
    if (!actorKey) {
      return;
    }

    if (!byUser.has(actorKey)) {
      byUser.set(actorKey, []);
    }
    byUser.get(actorKey)?.push(log);
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

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
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

    const [viewLogs, activeReportCount] = await Promise.all([
      prisma.auditLog.findMany({
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
      }),
      prisma.report.count({
        where: { active: true }
      })
    ]);

    const reportIds = Array.from(
      new Set(
        viewLogs
          .map((log) => Number(log.entityId))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    const [reports, activeUsers] = await Promise.all([
      prisma.report.findMany({
        where: { id: { in: reportIds } },
        select: {
          id: true,
          name: true,
          category: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),
      prisma.user.findMany({
        where: {
          active: true,
          role: "USER"
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          profileLabel: true
        }
      })
    ]);

    const reportMap = new Map<number, ReportRef>(reports.map((report) => [report.id, report]));
    const activeUserById = new Map(activeUsers.map((user) => [user.id, user]));
    const activeUserByUsername = new Map(activeUsers.map((user) => [user.username, user]));

    const reportRankingMap = new Map<string, { reportId: string; reportName: string; accesses: number }>();
    const categoryMap = new Map<string, { categoryName: string; accesses: number }>();
    const accessesByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, accesses: 0 }));
    const weekdaySeed = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
    const accessesByWeekdayMap = new Map(weekdaySeed.map((weekday) => [weekday, 0]));
    const durationsByReport = estimateSessionDurations(viewLogs as ViewLog[]);
    const userStatsMap = new Map<
      number,
      {
        userId: number;
        displayName: string;
        profileLabel: string | null;
        totalViews: number;
        reportCounts: Map<string, { reportId: string; reportName: string; accesses: number }>;
        hourCounts: number[];
        weekdayCounts: Map<string, number>;
      }
    >();

    viewLogs.forEach((log) => {
      const numericReportId = Number(log.entityId);
      const report = Number.isInteger(numericReportId) ? reportMap.get(numericReportId) : undefined;
      const reportId = `${log.entityId || "unknown"}`;
      const reportName = report?.name || extractReportName(log as ViewLog);
      const categoryName = report?.category?.name || "Sem categoria";

      const currentReport = reportRankingMap.get(reportId) || { reportId, reportName, accesses: 0 };
      currentReport.accesses += 1;
      reportRankingMap.set(reportId, currentReport);

      const currentCategory = categoryMap.get(categoryName) || { categoryName, accesses: 0 };
      currentCategory.accesses += 1;
      categoryMap.set(categoryName, currentCategory);

      const hour = formatFortalezaHour(log.createdAt);
      accessesByHour[hour].accesses += 1;

      const weekday = formatFortalezaWeekday(log.createdAt);
      accessesByWeekdayMap.set(weekday, (accessesByWeekdayMap.get(weekday) || 0) + 1);

      const activeUser =
        (log.actorUserId != null ? activeUserById.get(log.actorUserId) : undefined) ||
        (log.actorUsername ? activeUserByUsername.get(log.actorUsername) : undefined);

      if (activeUser) {
        if (!userStatsMap.has(activeUser.id)) {
          userStatsMap.set(activeUser.id, {
            userId: activeUser.id,
            displayName: activeUser.displayName,
            profileLabel: activeUser.profileLabel,
            totalViews: 0,
            reportCounts: new Map(),
            hourCounts: Array.from({ length: 24 }, () => 0),
            weekdayCounts: new Map(weekdaySeed.map((label) => [label, 0]))
          });
        }

        const userStats = userStatsMap.get(activeUser.id)!;
        userStats.totalViews += 1;
        userStats.hourCounts[hour] += 1;
        userStats.weekdayCounts.set(weekday, (userStats.weekdayCounts.get(weekday) || 0) + 1);

        const reportEntry = userStats.reportCounts.get(reportId) || {
          reportId,
          reportName,
          accesses: 0
        };
        reportEntry.accesses += 1;
        userStats.reportCounts.set(reportId, reportEntry);
      }
    });

    const reportRanking = Array.from(reportRankingMap.values())
      .sort((a, b) => b.accesses - a.accesses || a.reportName.localeCompare(b.reportName))
      .map((report) => {
        const durations = durationsByReport.get(report.reportId) || [];
        const averageMinutes = average(durations);

        return {
          ...report,
          averageMinutes
        };
      });

    const accessesByWeekday = weekdaySeed.map((weekday) => ({
      weekday,
      accesses: accessesByWeekdayMap.get(weekday) || 0
    }));

    const userStats = Array.from(userStatsMap.values())
      .map((user) => {
        const topReport = Array.from(user.reportCounts.values()).sort(
          (a, b) => b.accesses - a.accesses || a.reportName.localeCompare(b.reportName)
        )[0] || null;

        const peakHour = user.hourCounts.reduce(
          (best, value, hour) => (value > best.accesses ? { hour, accesses: value } : best),
          { hour: 0, accesses: 0 }
        );

        const peakWeekday = Array.from(user.weekdayCounts.entries()).reduce(
          (best, entry) => (entry[1] > best.accesses ? { weekday: entry[0], accesses: entry[1] } : best),
          { weekday: "segunda-feira", accesses: 0 }
        );

        return {
          userId: user.userId,
          displayName: user.displayName,
          profileLabel: user.profileLabel,
          totalViews: user.totalViews,
          topReportName: topReport?.reportName || "Sem dados",
          topReportAccesses: topReport?.accesses || 0,
          peakHour: `${String(peakHour.hour).padStart(2, "0")}h`,
          peakHourAccesses: peakHour.accesses,
          peakWeekday: peakWeekday.weekday,
          peakWeekdayAccesses: peakWeekday.accesses,
          uniqueReports: user.reportCounts.size
        };
      })
      .sort((a, b) => b.totalViews - a.totalViews || a.displayName.localeCompare(b.displayName));

    const categoryRanking = Array.from(categoryMap.values()).sort(
      (a, b) => b.accesses - a.accesses || a.categoryName.localeCompare(b.categoryName)
    );

    const allEstimatedDurations = Array.from(durationsByReport.values()).flat();
    const averageMinutesOverall = average(allEstimatedDurations);
    const accessedReports = reportRanking.length;
    const accessedReportsRate = activeReportCount
      ? Math.round((accessedReports / activeReportCount) * 100)
      : 0;

    return {
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      summary: {
        activeUsers: userStats.length,
        totalViews: viewLogs.length,
        accessedReports,
        activeReports: activeReportCount,
        accessedReportsRate,
        averageMinutesOverall
      },
      reportRanking,
      averageTimeByReport: reportRanking.map((report) => ({
        reportId: report.reportId,
        reportName: report.reportName,
        averageMinutes: report.averageMinutes
      })),
      accessesByHour,
      accessesByWeekday,
      userStats,
      categoryRanking
    };
  });
}
