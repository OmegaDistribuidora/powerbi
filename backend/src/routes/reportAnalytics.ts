import type { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireModuleAccess } from "../lib/modules";
import { requireAuth } from "../lib/security";

const FORTALEZA_TZ = "America/Fortaleza";
const DEFAULT_SESSION_MINUTES = 5;
const MAX_SESSION_MINUTES = 30;
const LOGIN_ACTIONS = ["LOGIN", "SSO_LOGIN"] as const;
const WEEKDAY_SEED = [
  "segunda-feira",
  "terca-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sabado",
  "sábado",
  "domingo"
] as const;

const analyticsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

type AuditLogRef = {
  id: number;
  actorUserId: number | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  entityId: string | null;
  createdAt: Date;
  after?: unknown;
};

type ReportRef = {
  id: number;
  name: string;
  category: {
    id: number;
    name: string;
  } | null;
};

type AccessBreakdown = {
  userId: number;
  displayName: string;
  accesses: number;
};

type ActiveUserRef = {
  id: number;
  username: string;
  displayName: string;
  profileLabel: string | null;
};

type UserStatAccumulator = {
  userId: number;
  username: string;
  displayName: string;
  profileLabel: string | null;
  totalViews: number;
  totalLogins: number;
  firstActivityAt: Date | null;
  lastActivityAt: Date | null;
  firstViewAt: Date | null;
  lastViewAt: Date | null;
  reportCounts: Map<string, { reportId: string; reportName: string; categoryName: string; accesses: number }>;
  viewHourCounts: number[];
  viewWeekdayCounts: Map<string, number>;
  viewDayCounts: Map<string, number>;
  loginHourCounts: number[];
  loginWeekdayCounts: Map<string, number>;
  loginDayCounts: Map<string, number>;
};

function parseFortalezaDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00-03:00`);
  const end = new Date(`${endDate}T23:59:59.999-03:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error("Intervalo de datas invalido.");
  }

  return { start, end };
}

function normalizeWeekday(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "terça-feira") return "terca-feira";
  if (normalized === "sábado") return "sabado";
  return normalized;
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
  return normalizeWeekday(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: FORTALEZA_TZ,
      weekday: "long"
    }).format(date)
  );
}

function extractReportName(log: AuditLogRef) {
  const after = log.after;
  if (after && typeof after === "object" && !Array.isArray(after) && "reportName" in after) {
    return String((after as { reportName?: unknown }).reportName || "Painel");
  }
  return "Painel";
}

function estimateSessionDurations(logs: AuditLogRef[]) {
  const byUser = new Map<string, AuditLogRef[]>();

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

  const reportDurations = new Map<string, number[]>();
  const userDurations = new Map<string, number[]>();

  byUser.forEach((userLogs, actorKey) => {
    userLogs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    userLogs.forEach((log, index) => {
      const nextLog = userLogs[index + 1];
      const rawMinutes = nextLog
        ? (nextLog.createdAt.getTime() - log.createdAt.getTime()) / 60000
        : DEFAULT_SESSION_MINUTES;
      const estimatedMinutes = Math.max(1, Math.min(MAX_SESSION_MINUTES, Math.round(rawMinutes)));
      const reportKey = `${log.entityId || "unknown"}`;

      if (!reportDurations.has(reportKey)) {
        reportDurations.set(reportKey, []);
      }
      reportDurations.get(reportKey)?.push(estimatedMinutes);

      if (!userDurations.has(actorKey)) {
        userDurations.set(actorKey, []);
      }
      userDurations.get(actorKey)?.push(estimatedMinutes);
    });
  });

  return { reportDurations, userDurations };
}

function formatFortalezaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FORTALEZA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function buildDateKeys(startDate: string, endDate: string) {
  const keys: string[] = [];
  const start = new Date(`${startDate}T00:00:00-03:00`);
  const end = new Date(`${endDate}T00:00:00-03:00`);

  for (let current = start; current <= end; current = new Date(current.getTime() + 24 * 60 * 60 * 1000)) {
    keys.push(formatFortalezaDateKey(current));
  }

  return keys;
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function sortBreakdown(entries: Map<number, AccessBreakdown>) {
  return Array.from(entries.values()).sort((a, b) => b.accesses - a.accesses || a.displayName.localeCompare(b.displayName));
}

function ensureUserAccumulator(userStatsMap: Map<number, UserStatAccumulator>, activeUser: ActiveUserRef, dateKeys: string[]) {
  if (!userStatsMap.has(activeUser.id)) {
    userStatsMap.set(activeUser.id, {
      userId: activeUser.id,
      username: activeUser.username,
      displayName: activeUser.displayName,
      profileLabel: activeUser.profileLabel,
      totalViews: 0,
      totalLogins: 0,
      firstActivityAt: null,
      lastActivityAt: null,
      firstViewAt: null,
      lastViewAt: null,
      reportCounts: new Map(),
      viewHourCounts: Array.from({ length: 24 }, () => 0),
      viewWeekdayCounts: new Map(WEEKDAY_SEED.map((label) => [normalizeWeekday(label), 0])),
      viewDayCounts: new Map(dateKeys.map((date) => [date, 0])),
      loginHourCounts: Array.from({ length: 24 }, () => 0),
      loginWeekdayCounts: new Map(WEEKDAY_SEED.map((label) => [normalizeWeekday(label), 0])),
      loginDayCounts: new Map(dateKeys.map((date) => [date, 0]))
    });
  }

  return userStatsMap.get(activeUser.id)!;
}

function trackActivityWindow(userStats: UserStatAccumulator, createdAt: Date, kind: "view" | "login") {
  if (!userStats.firstActivityAt || createdAt < userStats.firstActivityAt) {
    userStats.firstActivityAt = createdAt;
  }
  if (!userStats.lastActivityAt || createdAt > userStats.lastActivityAt) {
    userStats.lastActivityAt = createdAt;
  }

  if (kind === "view") {
    if (!userStats.firstViewAt || createdAt < userStats.firstViewAt) {
      userStats.firstViewAt = createdAt;
    }
    if (!userStats.lastViewAt || createdAt > userStats.lastViewAt) {
      userStats.lastViewAt = createdAt;
    }
  }
}

function trackBreakdown(targetMap: Map<number, AccessBreakdown>, activeUser: ActiveUserRef) {
  const current = targetMap.get(activeUser.id) || {
    userId: activeUser.id,
    displayName: activeUser.displayName,
    accesses: 0
  };
  current.accesses += 1;
  targetMap.set(activeUser.id, current);
}

function resolveActiveUser(
  log: Pick<AuditLogRef, "actorUserId" | "actorUsername">,
  activeUserById: Map<number, ActiveUserRef>,
  activeUserByUsername: Map<string, ActiveUserRef>
) {
  return (log.actorUserId != null ? activeUserById.get(log.actorUserId) : undefined) || (log.actorUsername ? activeUserByUsername.get(log.actorUsername) : undefined);
}

function findPeak(counts: number[]) {
  return counts.reduce(
    (best, value, index) => (value > best.accesses ? { index, accesses: value } : best),
    { index: 0, accesses: 0 }
  );
}

function findPeakWeekday(counts: Map<string, number>) {
  return Array.from(counts.entries()).reduce(
    (best, entry) => (entry[1] > best.accesses ? { weekday: entry[0], accesses: entry[1] } : best),
    { weekday: "segunda-feira", accesses: 0 }
  );
}

export async function registerReportAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/report-analytics", { preHandler: [requireAuth, requireModuleAccess("REPORTS_ANALYTICS")] }, async (request, reply) => {
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
      return reply.code(400).send({ message: error instanceof Error ? error.message : "Intervalo invalido." });
    }

    const [viewLogs, loginLogs, activeReportCount, activeUsers] = await Promise.all([
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
      prisma.auditLog.findMany({
        where: {
          action: {
            in: [...LOGIN_ACTIONS]
          },
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
          createdAt: true
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.report.count({
        where: { active: true }
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

    const reportIds = Array.from(
      new Set(
        viewLogs
          .map((log) => Number(log.entityId))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    const reports = await prisma.report.findMany({
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
    });

    const reportMap = new Map<number, ReportRef>(reports.map((report) => [report.id, report]));
    const activeUserById = new Map(activeUsers.map((user) => [user.id, user]));
    const activeUserByUsername = new Map(activeUsers.map((user) => [user.username, user]));
    const dateKeys = buildDateKeys(parsed.startDate, parsed.endDate);

    const reportRankingMap = new Map<string, { reportId: string; reportName: string; accesses: number }>();
    const categoryMap = new Map<string, { categoryName: string; accesses: number }>();
    const viewAccessesByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, accesses: 0 }));
    const loginAccessesByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, accesses: 0 }));
    const viewAccessesByWeekdayMap = new Map(WEEKDAY_SEED.map((weekday) => [normalizeWeekday(weekday), 0]));
    const loginAccessesByWeekdayMap = new Map(WEEKDAY_SEED.map((weekday) => [normalizeWeekday(weekday), 0]));
    const viewHourUsers = Array.from({ length: 24 }, () => new Map<number, AccessBreakdown>());
    const loginHourUsers = Array.from({ length: 24 }, () => new Map<number, AccessBreakdown>());
    const viewWeekdayUsers = new Map(WEEKDAY_SEED.map((weekday) => [normalizeWeekday(weekday), new Map<number, AccessBreakdown>()]));
    const loginWeekdayUsers = new Map(WEEKDAY_SEED.map((weekday) => [normalizeWeekday(weekday), new Map<number, AccessBreakdown>()]));
    const { reportDurations, userDurations } = estimateSessionDurations(viewLogs as AuditLogRef[]);
    const userStatsMap = new Map<number, UserStatAccumulator>();

    viewLogs.forEach((log) => {
      const numericReportId = Number(log.entityId);
      const report = Number.isInteger(numericReportId) ? reportMap.get(numericReportId) : undefined;
      const reportId = `${log.entityId || "unknown"}`;
      const reportName = report?.name || extractReportName(log as AuditLogRef);
      const categoryName = report?.category?.name || "Sem categoria";

      const currentReport = reportRankingMap.get(reportId) || { reportId, reportName, accesses: 0 };
      currentReport.accesses += 1;
      reportRankingMap.set(reportId, currentReport);

      const currentCategory = categoryMap.get(categoryName) || { categoryName, accesses: 0 };
      currentCategory.accesses += 1;
      categoryMap.set(categoryName, currentCategory);

      const hour = formatFortalezaHour(log.createdAt);
      viewAccessesByHour[hour].accesses += 1;

      const weekday = formatFortalezaWeekday(log.createdAt);
      viewAccessesByWeekdayMap.set(weekday, (viewAccessesByWeekdayMap.get(weekday) || 0) + 1);

      const activeUser = resolveActiveUser(log, activeUserById, activeUserByUsername);
      if (!activeUser) {
        return;
      }

      const userStats = ensureUserAccumulator(userStatsMap, activeUser, dateKeys);
      userStats.totalViews += 1;
      trackActivityWindow(userStats, log.createdAt, "view");
      userStats.viewHourCounts[hour] += 1;
      userStats.viewWeekdayCounts.set(weekday, (userStats.viewWeekdayCounts.get(weekday) || 0) + 1);
      const dateKey = formatFortalezaDateKey(log.createdAt);
      userStats.viewDayCounts.set(dateKey, (userStats.viewDayCounts.get(dateKey) || 0) + 1);

      trackBreakdown(viewHourUsers[hour], activeUser);
      const weekdayUsers = viewWeekdayUsers.get(weekday);
      if (weekdayUsers) {
        trackBreakdown(weekdayUsers, activeUser);
      }

      const reportEntry = userStats.reportCounts.get(reportId) || {
        reportId,
        reportName,
        categoryName,
        accesses: 0
      };
      reportEntry.accesses += 1;
      userStats.reportCounts.set(reportId, reportEntry);
    });

    loginLogs.forEach((log) => {
      const hour = formatFortalezaHour(log.createdAt);
      const weekday = formatFortalezaWeekday(log.createdAt);

      loginAccessesByHour[hour].accesses += 1;
      loginAccessesByWeekdayMap.set(weekday, (loginAccessesByWeekdayMap.get(weekday) || 0) + 1);

      const activeUser = resolveActiveUser(log, activeUserById, activeUserByUsername);
      if (!activeUser) {
        return;
      }

      const userStats = ensureUserAccumulator(userStatsMap, activeUser, dateKeys);
      userStats.totalLogins += 1;
      trackActivityWindow(userStats, log.createdAt, "login");
      userStats.loginHourCounts[hour] += 1;
      userStats.loginWeekdayCounts.set(weekday, (userStats.loginWeekdayCounts.get(weekday) || 0) + 1);
      const dateKey = formatFortalezaDateKey(log.createdAt);
      userStats.loginDayCounts.set(dateKey, (userStats.loginDayCounts.get(dateKey) || 0) + 1);

      trackBreakdown(loginHourUsers[hour], activeUser);
      const weekdayUsers = loginWeekdayUsers.get(weekday);
      if (weekdayUsers) {
        trackBreakdown(weekdayUsers, activeUser);
      }
    });

    activeUsers.forEach((activeUser) => {
      ensureUserAccumulator(userStatsMap, activeUser, dateKeys);
    });

    const reportRanking = Array.from(reportRankingMap.values())
      .sort((a, b) => b.accesses - a.accesses || a.reportName.localeCompare(b.reportName))
      .map((report) => {
        const durations = reportDurations.get(report.reportId) || [];
        const averageMinutes = average(durations);

        return {
          ...report,
          averageMinutes
        };
      });

    const accessesByWeekday = WEEKDAY_SEED.filter((weekday, index, array) => array.indexOf(weekday) === index)
      .map((weekday) => normalizeWeekday(weekday))
      .filter((weekday, index, array) => array.indexOf(weekday) === index)
      .map((weekday) => ({
        weekday,
        reportAccesses: viewAccessesByWeekdayMap.get(weekday) || 0,
        logins: loginAccessesByWeekdayMap.get(weekday) || 0,
        reportUsers: sortBreakdown(viewWeekdayUsers.get(weekday) || new Map()),
        loginUsers: sortBreakdown(loginWeekdayUsers.get(weekday) || new Map())
      }));

    const userStats = Array.from(userStatsMap.values())
      .map((user) => {
        const reportBreakdown = Array.from(user.reportCounts.values()).sort(
          (a, b) => b.accesses - a.accesses || a.reportName.localeCompare(b.reportName)
        );
        const topReport = reportBreakdown[0] || null;

        const peakViewHour = findPeak(user.viewHourCounts);
        const peakViewWeekday = findPeakWeekday(user.viewWeekdayCounts);
        const peakLoginHour = findPeak(user.loginHourCounts);
        const peakLoginWeekday = findPeakWeekday(user.loginWeekdayCounts);
        const averageMinutes = average([
          ...(userDurations.get(`id:${user.userId}`) || []),
          ...(userDurations.get(`username:${user.username}`) || [])
        ]);
        const totalActivity = user.totalViews + user.totalLogins;

        return {
          userId: user.userId,
          displayName: user.displayName,
          profileLabel: user.profileLabel,
          totalViews: user.totalViews,
          totalLogins: user.totalLogins,
          totalActivity,
          averageMinutes,
          topReportName: topReport?.reportName || "Sem dados",
          topReportAccesses: topReport?.accesses || 0,
          firstActivityAt: user.firstActivityAt?.toISOString() || null,
          lastActivityAt: user.lastActivityAt?.toISOString() || null,
          firstViewAt: user.firstViewAt?.toISOString() || null,
          lastViewAt: user.lastViewAt?.toISOString() || null,
          peakHour: `${String(peakViewHour.index).padStart(2, "0")}h`,
          peakHourAccesses: peakViewHour.accesses,
          peakWeekday: peakViewWeekday.weekday,
          peakWeekdayAccesses: peakViewWeekday.accesses,
          peakLoginHour: `${String(peakLoginHour.index).padStart(2, "0")}h`,
          peakLoginHourAccesses: peakLoginHour.accesses,
          peakLoginWeekday: peakLoginWeekday.weekday,
          peakLoginWeekdayAccesses: peakLoginWeekday.accesses,
          uniqueReports: user.reportCounts.size,
          reportBreakdown,
          activityByDay: dateKeys.map((date) => ({
            date,
            views: user.viewDayCounts.get(date) || 0,
            logins: user.loginDayCounts.get(date) || 0
          })),
          viewHours: user.viewHourCounts.map((accesses, hour) => ({ hour, accesses })),
          loginHours: user.loginHourCounts.map((logins, hour) => ({ hour, logins })),
          viewWeekdays: Array.from(user.viewWeekdayCounts.entries()).map(([weekday, accesses]) => ({ weekday, accesses })),
          loginWeekdays: Array.from(user.loginWeekdayCounts.entries()).map(([weekday, logins]) => ({ weekday, logins }))
        };
      })
      .sort((a, b) => {
        if (b.totalActivity !== a.totalActivity) {
          return b.totalActivity - a.totalActivity;
        }
        if (b.totalViews !== a.totalViews) {
          return b.totalViews - a.totalViews;
        }
        if (b.totalLogins !== a.totalLogins) {
          return b.totalLogins - a.totalLogins;
        }
        return a.displayName.localeCompare(b.displayName);
      });

    const categoryRanking = Array.from(categoryMap.values()).sort(
      (a, b) => b.accesses - a.accesses || a.categoryName.localeCompare(b.categoryName)
    );

    const allEstimatedDurations = Array.from(reportDurations.values()).flat();
    const averageMinutesOverall = average(allEstimatedDurations);
    const accessedReports = reportRanking.length;
    const accessedReportsRate = activeReportCount ? Math.round((accessedReports / activeReportCount) * 100) : 0;
    const activeUsersWithActivity = userStats.filter((user) => user.totalActivity > 0).length;

    return {
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      summary: {
        activeUsers: activeUsersWithActivity,
        totalViews: viewLogs.length,
        totalLogins: loginLogs.length,
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
      accessesByHour: viewAccessesByHour.map((item) => ({
        hour: item.hour,
        reportAccesses: item.accesses,
        logins: loginAccessesByHour[item.hour].accesses,
        reportUsers: sortBreakdown(viewHourUsers[item.hour]),
        loginUsers: sortBreakdown(loginHourUsers[item.hour])
      })),
      accessesByWeekday,
      userStats,
      categoryRanking
    };
  });
}
