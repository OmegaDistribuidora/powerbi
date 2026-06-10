import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";

function formatWeekdayLabel(value) {
  const normalized = String(value || "").toLowerCase();
  const mapping = {
    "segunda-feira": "Segunda-feira",
    "terca-feira": "Terca-feira",
    "terça-feira": "Terca-feira",
    "quarta-feira": "Quarta-feira",
    "quinta-feira": "Quinta-feira",
    "sexta-feira": "Sexta-feira",
    sabado: "Sabado",
    "sábado": "Sabado",
    domingo: "Domingo"
  };

  return mapping[normalized] || value;
}

function formatWeekdayShort(value) {
  const normalized = String(value || "").toLowerCase();
  const mapping = {
    "segunda-feira": "Seg",
    "terca-feira": "Ter",
    "terça-feira": "Ter",
    "quarta-feira": "Qua",
    "quinta-feira": "Qui",
    "sexta-feira": "Sex",
    sabado: "Sab",
    "sábado": "Sab",
    domingo: "Dom"
  };

  return mapping[normalized] || value;
}

function formatMinutes(value) {
  if (value == null) {
    return "Sem base suficiente";
  }

  return `${String(value).replace(".", ",")} min`;
}

function formatCount(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatAccessLabel(value) {
  return formatCount(value, "abertura", "aberturas");
}

function formatLoginLabel(value) {
  return formatCount(value, "login", "logins");
}

function formatDateTime(value) {
  if (!value) {
    return "Sem dados";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatPercent(value) {
  return `${Math.round(value || 0)}%`;
}

function getUserActivityTotal(user) {
  return user?.totalActivity ?? (user?.totalViews || 0) + (user?.totalLogins || 0);
}

function combineUserHours(user) {
  const views = new Map((user?.viewHours || []).map((item) => [item.hour, item.accesses || 0]));
  const logins = new Map((user?.loginHours || []).map((item) => [item.hour, item.logins || 0]));

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    views: views.get(hour) || 0,
    logins: logins.get(hour) || 0
  }));
}

function buildSeriesTooltipData({ item, itemLabel, seriesLabel, total, users, totalFormatter }) {
  return {
    title: itemLabel,
    accent: seriesLabel,
    tone: seriesLabel === "Login" ? "login" : "report",
    summary: totalFormatter(total),
    lines: (users || []).map((user) => ({
      label: user.displayName,
      value: formatCount(user.accesses, seriesLabel.toLowerCase(), `${seriesLabel.toLowerCase()}s`)
    }))
  };
}

function AnalyticsTooltip({ tooltip }) {
  if (!tooltip || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="analytics-tooltip"
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`
      }}
    >
      <div className="analytics-tooltip-header">
        <strong>{tooltip.title}</strong>
        <span className={`analytics-tooltip-accent analytics-tooltip-accent-${tooltip.tone}`}>{tooltip.accent}</span>
      </div>
      <div className="analytics-tooltip-summary">{tooltip.summary}</div>
      {tooltip.lines.length ? (
        <div className="analytics-tooltip-list">
          {tooltip.lines.map((line) => (
            <div key={`${line.label}-${line.value}`} className="analytics-tooltip-row">
              <span>{line.label}</span>
              <span>{line.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="analytics-tooltip-empty">Sem detalhamento por usuario.</div>
      )}
    </div>,
    document.body
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="page-card analytics-metric-card">
      <span className="muted small">{label}</span>
      <strong className="analytics-metric-value">{value}</strong>
      {hint ? <span className="muted small">{hint}</span> : null}
    </article>
  );
}

function BarList({ title, items, valueFormatter, labelFormatter, meta }) {
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <article className="page-card analytics-card analytics-card-compact">
      <div className="header-line">
        <h2>{title}</h2>
        {meta ? <span className="tag-chip tag-chip-muted">{meta}</span> : null}
      </div>
      <div className="analytics-list">
        {items.length ? (
          items.map((item) => (
            <div key={item.key} className="analytics-row">
              <div className="analytics-row-head">
                <strong>{labelFormatter(item.label)}</strong>
                <span className="muted small">{valueFormatter(item.value)}</span>
              </div>
              <div className="analytics-bar-track">
                <div
                  className="analytics-bar-fill"
                  style={{ width: `${Math.max(6, (item.value / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="muted">Nenhum dado disponivel no periodo selecionado.</p>
        )}
      </div>
    </article>
  );
}

function DualVerticalBarChart({ title, items, labelFormatter, minWidth = 760 }) {
  const [tooltip, setTooltip] = useState(null);
  const chartHeight = 240;
  const barWidth = 18;
  const innerGap = 8;
  const groupGap = 18;
  const leftPadding = 46;
  const rightPadding = 18;
  const topPadding = 18;
  const bottomPadding = 62;
  const groupWidth = barWidth * 2 + innerGap;
  const contentWidth =
    leftPadding +
    rightPadding +
    items.length * groupWidth +
    Math.max(0, items.length - 1) * groupGap;
  const chartWidth = Math.max(minWidth, contentWidth);
  const maxValue = Math.max(
    1,
    ...items.flatMap((item) => [item.reportAccesses || 0, item.logins || 0])
  );

  function handleTooltipMove(event, payload) {
    const tooltipWidth = 340;
    const tooltipHeight = 104 + Math.max((payload.lines?.length || 0) * 24, 24);
    const minX = tooltipWidth / 2 + 16;
    const maxX = window.innerWidth - tooltipWidth / 2 - 16;
    const x = Math.min(Math.max(event.clientX, minX), Math.max(minX, maxX));
    const y = Math.max(event.clientY, tooltipHeight + 24);

    setTooltip({
      ...payload,
      x,
      y
    });
  }

  return (
    <article className="page-card analytics-card analytics-card-compact">
      <div className="header-line">
        <h2>{title}</h2>
        <div className="analytics-legend">
          <span className="analytics-legend-item">
            <span className="analytics-legend-swatch analytics-legend-swatch-primary" />
            <span className="muted small">Aberturas</span>
          </span>
          <span className="analytics-legend-item">
            <span className="analytics-legend-swatch analytics-legend-swatch-secondary" />
            <span className="muted small">Logins</span>
          </span>
        </div>
      </div>
      {items.length ? (
        <div className="analytics-chart-shell">
          <svg
            className="analytics-chart"
            viewBox={`0 0 ${chartWidth} ${chartHeight + topPadding + bottomPadding}`}
            style={{ width: `max(100%, ${chartWidth}px)` }}
            role="img"
            aria-label={title}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = topPadding + chartHeight - chartHeight * tick;
              const tickValue = Math.round(maxValue * tick);
              return (
                <g key={tick}>
                  <line
                    x1={leftPadding - 8}
                    y1={y}
                    x2={chartWidth - rightPadding}
                    y2={y}
                    className="analytics-grid-line"
                  />
                  <text x={0} y={y + 4} className="analytics-axis-text analytics-axis-y">
                    {tickValue}
                  </text>
                </g>
              );
            })}

            {items.map((item, index) => {
              const groupX = leftPadding + index * (groupWidth + groupGap);
              const reportHeight = maxValue ? ((item.reportAccesses || 0) / maxValue) * chartHeight : 0;
              const loginHeight = maxValue ? ((item.logins || 0) / maxValue) * chartHeight : 0;
              const reportY = topPadding + chartHeight - reportHeight;
              const loginY = topPadding + chartHeight - loginHeight;
              const itemLabel = labelFormatter(item.label);

              return (
                <g key={item.key}>
                  <rect
                    x={groupX}
                    y={reportY}
                    width={barWidth}
                    height={Math.max(2, reportHeight)}
                    rx={6}
                    className="analytics-bar-vertical"
                    onMouseEnter={(event) =>
                      handleTooltipMove(
                        event,
                        buildSeriesTooltipData({
                          item,
                          itemLabel,
                          seriesLabel: "Abertura",
                          total: item.reportAccesses || 0,
                          users: item.reportUsers || [],
                          totalFormatter: formatAccessLabel
                        })
                      )
                    }
                    onMouseMove={(event) =>
                      handleTooltipMove(
                        event,
                        buildSeriesTooltipData({
                          item,
                          itemLabel,
                          seriesLabel: "Abertura",
                          total: item.reportAccesses || 0,
                          users: item.reportUsers || [],
                          totalFormatter: formatAccessLabel
                        })
                      )
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                  <rect
                    x={groupX + barWidth + innerGap}
                    y={loginY}
                    width={barWidth}
                    height={Math.max(2, loginHeight)}
                    rx={6}
                    className="analytics-bar-vertical-secondary"
                    onMouseEnter={(event) =>
                      handleTooltipMove(
                        event,
                        buildSeriesTooltipData({
                          item,
                          itemLabel,
                          seriesLabel: "Login",
                          total: item.logins || 0,
                          users: item.loginUsers || [],
                          totalFormatter: formatLoginLabel
                        })
                      )
                    }
                    onMouseMove={(event) =>
                      handleTooltipMove(
                        event,
                        buildSeriesTooltipData({
                          item,
                          itemLabel,
                          seriesLabel: "Login",
                          total: item.logins || 0,
                          users: item.loginUsers || [],
                          totalFormatter: formatLoginLabel
                        })
                      )
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                  <text
                    x={groupX + groupWidth / 2}
                    y={topPadding + chartHeight + 20}
                    textAnchor="middle"
                    className="analytics-axis-text analytics-axis-x"
                  >
                    {itemLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <p className="muted">Nenhum dado disponivel no periodo selecionado.</p>
      )}
      <AnalyticsTooltip tooltip={tooltip} />
    </article>
  );
}

function ActivityDonut({ user }) {
  const views = user?.totalViews || 0;
  const logins = user?.totalLogins || 0;
  const total = Math.max(1, views + logins);
  const viewShare = (views / total) * 100;
  const circumference = 100;

  return (
    <div className="analytics-donut-card">
      <svg className="analytics-donut" viewBox="0 0 42 42" role="img" aria-label="Mix de atividade">
        <circle className="analytics-donut-bg" cx="21" cy="21" r="15.915" />
        <circle
          className="analytics-donut-segment analytics-donut-segment-view"
          cx="21"
          cy="21"
          r="15.915"
          strokeDasharray={`${viewShare} ${circumference - viewShare}`}
          strokeDashoffset="25"
        />
        <circle
          className="analytics-donut-segment analytics-donut-segment-login"
          cx="21"
          cy="21"
          r="15.915"
          strokeDasharray={`${100 - viewShare} ${viewShare}`}
          strokeDashoffset={25 - viewShare}
        />
      </svg>
      <div className="analytics-donut-copy">
        <span className="muted small">Mix de atividade</span>
        <strong>{formatPercent(viewShare)} paineis</strong>
        <span className="muted small">{formatAccessLabel(views)} / {formatLoginLabel(logins)}</span>
      </div>
    </div>
  );
}

function UserHourBars({ user }) {
  const items = combineUserHours(user);
  const maxValue = Math.max(1, ...items.map((item) => item.views + item.logins));

  return (
    <div className="analytics-user-hour-chart" aria-label="Distribuicao de atividade por hora">
      {items.map((item) => {
        const total = item.views + item.logins;
        return (
          <div key={item.hour} className="analytics-user-hour-column" title={`${String(item.hour).padStart(2, "0")}h: ${formatCount(total, "evento", "eventos")}`}>
            <div className="analytics-user-hour-bar">
              <span
                className="analytics-user-hour-fill analytics-user-hour-fill-view"
                style={{ height: `${item.views ? Math.max(8, (item.views / maxValue) * 100) : 0}%` }}
              />
              <span
                className="analytics-user-hour-fill analytics-user-hour-fill-login"
                style={{ height: `${item.logins ? Math.max(8, (item.logins / maxValue) * 100) : 0}%` }}
              />
            </div>
            <span>{String(item.hour).padStart(2, "0")}</span>
          </div>
        );
      })}
    </div>
  );
}

function UserReportBreakdown({ user }) {
  const items = user?.reportBreakdown || [];
  const maxValue = Math.max(1, ...items.map((item) => item.accesses || 0));

  return (
    <div className="analytics-user-report-list">
      {items.length ? (
        items.slice(0, 8).map((item, index) => (
          <div key={item.reportId} className="analytics-user-report-row">
            <span className="analytics-rank-number">{index + 1}</span>
            <div className="analytics-user-report-main">
              <div className="analytics-row-head">
                <strong>{item.reportName}</strong>
                <span className="muted small">{formatAccessLabel(item.accesses)}</span>
              </div>
              <div className="analytics-bar-track">
                <div
                  className="analytics-bar-fill"
                  style={{ width: `${Math.max(6, ((item.accesses || 0) / maxValue) * 100)}%` }}
                />
              </div>
              <span className="muted small">{item.categoryName || "Sem categoria"}</span>
            </div>
          </div>
        ))
      ) : (
        <p className="muted">Este usuario fez login no periodo, mas nao abriu paineis.</p>
      )}
    </div>
  );
}

function ActiveUsersRanking({ users, selectedUserId, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const maxActivity = Math.max(1, ...users.map(getUserActivityTotal));
  const visibleUsers = showAll ? users : users.slice(0, 12);
  const hasHiddenUsers = users.length > 12;

  return (
    <article className="page-card analytics-card analytics-card-compact">
      <div className="header-line">
        <div>
          <h2>Usuarios mais ativos</h2>
          <span className="muted small">Ranking por logins e aberturas de paineis no periodo.</span>
        </div>
      </div>
      <div className="analytics-active-user-list">
        {users.length ? (
          visibleUsers.map((user, index) => {
            const totalActivity = getUserActivityTotal(user);
            const selected = selectedUserId === user.userId;

            return (
              <button
                key={user.userId}
                type="button"
                className={`analytics-active-user-card${selected ? " is-selected" : ""}`}
                onClick={() => onSelect(user.userId)}
              >
                <span className="analytics-rank-number">{index + 1}</span>
                <span className="analytics-active-user-main">
                  <strong>{user.displayName}</strong>
                  <span className="muted small">{user.profileLabel || "Sem perfil"}</span>
                  <span className="analytics-bar-track">
                    <span
                      className="analytics-bar-fill"
                      style={{ width: `${Math.max(8, (totalActivity / maxActivity) * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="analytics-active-user-score">
                  <strong>{totalActivity}</strong>
                  <span className="muted small">eventos</span>
                </span>
              </button>
            );
          })
        ) : (
          <p className="muted">Nenhum usuario gerou atividade no periodo selecionado.</p>
        )}
      </div>
      {hasHiddenUsers ? (
        <button
          type="button"
          className="secondary-btn compact-btn analytics-show-all-btn"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Mostrar menos" : `Mostrar todos (${users.length})`}
        </button>
      ) : null}
    </article>
  );
}

function UserDetailPanel({ user }) {
  if (!user) {
    return (
      <article className="page-card analytics-card analytics-card-compact analytics-user-detail-empty">
        <h2>Resumo do usuario</h2>
        <p className="muted">Selecione um usuario no ranking para ver o detalhamento.</p>
      </article>
    );
  }

  const totalActivity = getUserActivityTotal(user);
  const reportCoverage = user.uniqueReports ? `${user.uniqueReports} ${user.uniqueReports === 1 ? "painel" : "paineis"}` : "Nenhum painel";

  return (
    <article className="page-card analytics-card analytics-card-compact analytics-user-detail-card">
      <div className="header-line">
        <div>
          <h2>{user.displayName}</h2>
          <span className="muted small">{user.profileLabel || "Sem perfil"}</span>
        </div>
        <span className="tag-chip tag-chip-muted">{formatCount(totalActivity, "evento", "eventos")}</span>
      </div>

      <div className="analytics-user-detail-grid">
        <ActivityDonut user={user} />
        <div className="analytics-user-metric-box">
          <span className="muted small">Aberturas de painel</span>
          <strong>{user.totalViews}</strong>
          <span className="muted small">{reportCoverage}</span>
        </div>
        <div className="analytics-user-metric-box">
          <span className="muted small">Logins no sistema</span>
          <strong>{user.totalLogins}</strong>
          <span className="muted small">Manual e SSO</span>
        </div>
        <div className="analytics-user-metric-box">
          <span className="muted small">Tempo medio estimado</span>
          <strong>{formatMinutes(user.averageMinutes)}</strong>
          <span className="muted small">Entre aberturas de paineis</span>
        </div>
      </div>

      <div className="analytics-user-split">
        <div className="analytics-user-panel">
          <div className="header-line">
            <h3>Paineis mais abertos</h3>
            <span className="muted small">{user.topReportName}</span>
          </div>
          <UserReportBreakdown user={user} />
        </div>

        <div className="analytics-user-panel">
          <h3>Padrao de uso</h3>
          <div className="analytics-user-peak-grid">
            <div>
              <span className="muted small">Pico de painel</span>
              <strong>{user.peakHour}</strong>
              <span className="muted small">{formatWeekdayLabel(user.peakWeekday)} - {formatAccessLabel(user.peakWeekdayAccesses)}</span>
            </div>
            <div>
              <span className="muted small">Pico de login</span>
              <strong>{user.peakLoginHour}</strong>
              <span className="muted small">{formatWeekdayLabel(user.peakLoginWeekday)} - {formatLoginLabel(user.peakLoginWeekdayAccesses)}</span>
            </div>
            <div>
              <span className="muted small">Primeira atividade</span>
              <strong>{formatDateTime(user.firstActivityAt)}</strong>
            </div>
            <div>
              <span className="muted small">Ultima atividade</span>
              <strong>{formatDateTime(user.lastActivityAt)}</strong>
            </div>
          </div>
          <UserHourBars user={user} />
        </div>
      </div>
    </article>
  );
}

export default function ReportsAnalyticsPage() {
  const { token } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [filters, setFilters] = useState(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10)
    };
  });

  async function loadAnalytics(currentFilters = filters) {
    setLoading(true);
    try {
      const payload = await apiJson(
        `/report-analytics?startDate=${currentFilters.startDate}&endDate=${currentFilters.endDate}`,
        { token }
      );
      setData(payload);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics(filters);
  }, [token]);

  useEffect(() => {
    const users = data?.userStats || [];
    if (!users.length) {
      setSelectedUserId(null);
      return;
    }

    if (!users.some((user) => user.userId === selectedUserId)) {
      setSelectedUserId(users[0].userId);
    }
  }, [data, selectedUserId]);

  const rankingItems = useMemo(
    () =>
      (data?.reportRanking || []).slice(0, 10).map((item) => ({
        key: item.reportId,
        label: item.reportName,
        value: item.accesses
      })),
    [data]
  );

  const averageItems = useMemo(
    () =>
      (data?.averageTimeByReport || [])
        .filter((item) => item.averageMinutes != null)
        .sort((a, b) => (b.averageMinutes || 0) - (a.averageMinutes || 0))
        .slice(0, 10)
        .map((item) => ({
          key: item.reportId,
          label: item.reportName,
          value: item.averageMinutes || 0
        })),
    [data]
  );

  const hourItems = useMemo(
    () =>
      (data?.accessesByHour || []).map((item) => ({
        key: String(item.hour),
        label: `${String(item.hour).padStart(2, "0")}h`,
        reportAccesses: item.reportAccesses || 0,
        logins: item.logins || 0,
        reportUsers: item.reportUsers || [],
        loginUsers: item.loginUsers || []
      })),
    [data]
  );

  const weekdayItems = useMemo(
    () =>
      (data?.accessesByWeekday || []).map((item) => ({
        key: item.weekday,
        label: item.weekday,
        reportAccesses: item.reportAccesses || 0,
        logins: item.logins || 0,
        reportUsers: item.reportUsers || [],
        loginUsers: item.loginUsers || []
      })),
    [data]
  );

  const categoryItems = useMemo(
    () =>
      (data?.categoryRanking || []).slice(0, 10).map((item) => ({
        key: item.categoryName,
        label: item.categoryName,
        value: item.accesses
      })),
    [data]
  );

  const activeUsers = data?.userStats || [];
  const selectedUser = activeUsers.find((user) => user.userId === selectedUserId) || activeUsers[0] || null;

  const accessedReportsSummary = data?.summary
    ? `${data.summary.accessedReports}/${data.summary.activeReports} (${data.summary.accessedReportsRate}%)`
    : "0/0 (0%)";

  return (
    <div className="page-stack">
      <section className="page-card admin-toolbar-card">
        <div className="header-line">
          <div className="admin-toolbar-copy">
            <div className="eyebrow">Relatorios</div>
            <h1>Indicadores de uso</h1>
          </div>
          <form
            className="analytics-filter-bar"
            onSubmit={(event) => {
              event.preventDefault();
              loadAnalytics(filters);
            }}
          >
            <label>
              Inicio
              <input
                type="date"
                value={filters.startDate}
                onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label>
              Fim
              <input
                type="date"
                value={filters.endDate}
                onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
            <button type="submit" className="secondary-btn" disabled={loading}>
              {loading ? "Atualizando..." : "Aplicar"}
            </button>
          </form>
        </div>
      </section>

      {error ? <div className="page-card error-text">{error}</div> : null}

      <section className="analytics-metrics-grid analytics-metrics-grid-wide">
        <MetricCard
          label="Usuarios ativos"
          value={data?.summary?.activeUsers ?? 0}
          hint="Usuarios ativos que fizeram login e/ou abriram pelo menos um painel no periodo."
        />
        <MetricCard
          label="Aberturas de painel"
          value={data?.summary?.totalViews ?? 0}
          hint="Quantidade total de aberturas de paineis no periodo."
        />
        <MetricCard
          label="Logins no sistema"
          value={data?.summary?.totalLogins ?? 0}
          hint="Quantidade total de logins manuais e via SSO no periodo."
        />
        <MetricCard
          label="Relatorios acessados"
          value={accessedReportsSummary}
          hint="Quantidade acessada no periodo sobre o total de relatorios ativos."
        />
        <MetricCard
          label="Tempo medio geral"
          value={formatMinutes(data?.summary?.averageMinutesOverall)}
          hint="Tempo estimado medio entre aberturas de relatorios."
        />
      </section>

      <section className="analytics-user-insights">
        <ActiveUsersRanking users={activeUsers} selectedUserId={selectedUser?.userId || null} onSelect={setSelectedUserId} />
        <UserDetailPanel user={selectedUser} />
      </section>

      <section className="analytics-grid">
        <BarList
          title="Ranking de paineis mais abertos"
          items={rankingItems}
          valueFormatter={formatAccessLabel}
          labelFormatter={(label) => label}
          meta={`Logins no periodo: ${formatLoginLabel(data?.summary?.totalLogins ?? 0)}`}
        />
        <BarList
          title="Tempo medio estimado por painel"
          items={averageItems}
          valueFormatter={formatMinutes}
          labelFormatter={(label) => label}
          meta={`Aberturas no periodo: ${formatAccessLabel(data?.summary?.totalViews ?? 0)}`}
        />
        <DualVerticalBarChart title="Uso por hora" items={hourItems} labelFormatter={(label) => label} minWidth={760} />
        <DualVerticalBarChart
          title="Uso por dia da semana"
          items={weekdayItems}
          labelFormatter={formatWeekdayShort}
          minWidth={520}
        />
      </section>

      <section className="analytics-stack">
        <BarList
          title="Categorias mais acessadas por abertura de painel"
          items={categoryItems}
          valueFormatter={formatAccessLabel}
          labelFormatter={(label) => label}
          meta={`Logins no periodo: ${formatLoginLabel(data?.summary?.totalLogins ?? 0)}`}
        />
      </section>
    </div>
  );
}
