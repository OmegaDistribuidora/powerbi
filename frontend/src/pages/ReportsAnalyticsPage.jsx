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

function formatDayLabel(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${value}T12:00:00`));
}

function formatHourLabel(value) {
  return `${String(value).padStart(2, "0")}h`;
}

function formatPercent(value) {
  return `${Math.round(value || 0)}%`;
}

function getUserActivityTotal(user) {
  return user?.totalActivity ?? (user?.totalViews || 0) + (user?.totalLogins || 0);
}

function getProfileLabel(user) {
  return String(user?.profileLabel || "").trim() || "Sem perfil";
}

function sameDateRangeDay(startDate, endDate) {
  return Boolean(startDate && endDate && startDate === endDate);
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

function UserProfileFilter({ users, selectedUserIds, onChange }) {
  const [open, setOpen] = useState(false);
  const allUserIds = users.map((user) => user.id);
  const selectedSet = new Set(selectedUserIds || []);
  const allSelected = allUserIds.length > 0 && allUserIds.every((userId) => selectedSet.has(userId));
  const selectedCount = allUserIds.filter((userId) => selectedSet.has(userId)).length;

  const groups = useMemo(() => {
    const groupMap = new Map();
    users.forEach((user) => {
      const profile = getProfileLabel(user);
      if (!groupMap.has(profile)) {
        groupMap.set(profile, []);
      }
      groupMap.get(profile).push(user);
    });

    return Array.from(groupMap.entries())
      .map(([profile, groupUsers]) => ({
        profile,
        users: groupUsers.sort((a, b) => a.displayName.localeCompare(b.displayName))
      }))
      .sort((a, b) => a.profile.localeCompare(b.profile));
  }, [users]);

  function commit(nextIds) {
    onChange(Array.from(new Set(nextIds)));
  }

  function toggleAll() {
    commit(allSelected ? [] : allUserIds);
  }

  function toggleProfile(groupUsers) {
    const groupIds = groupUsers.map((user) => user.id);
    const groupSelected = groupIds.every((userId) => selectedSet.has(userId));
    const nextSet = new Set(selectedSet);

    groupIds.forEach((userId) => {
      if (groupSelected) {
        nextSet.delete(userId);
      } else {
        nextSet.add(userId);
      }
    });

    commit(Array.from(nextSet));
  }

  function toggleUser(userId) {
    const nextSet = new Set(selectedSet);
    if (nextSet.has(userId)) {
      nextSet.delete(userId);
    } else {
      nextSet.add(userId);
    }
    commit(Array.from(nextSet));
  }

  const label = allSelected
    ? "Todos os usuarios"
    : selectedCount
      ? `${selectedCount} usuario${selectedCount === 1 ? "" : "s"}`
      : "Nenhum usuario";

  return (
    <div className="analytics-user-filter">
      <button type="button" className="secondary-btn analytics-user-filter-toggle" onClick={() => setOpen((current) => !current)}>
        {label}
      </button>
      {open ? (
        <div className="analytics-user-filter-panel">
          <label className="check-row analytics-user-filter-all">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>Marcar todos</span>
          </label>

          <div className="analytics-user-filter-groups">
            {groups.map((group) => {
              const groupIds = group.users.map((user) => user.id);
              const groupSelected = groupIds.length > 0 && groupIds.every((userId) => selectedSet.has(userId));
              const groupPartial = groupIds.some((userId) => selectedSet.has(userId)) && !groupSelected;

              return (
                <section key={group.profile} className="analytics-user-filter-group">
                  <label className="check-row analytics-user-filter-profile">
                    <input
                      type="checkbox"
                      checked={groupSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = groupPartial;
                      }}
                      onChange={() => toggleProfile(group.users)}
                    />
                    <span>{group.profile}</span>
                  </label>
                  <div className="analytics-user-filter-users">
                    {group.users.map((user) => (
                      <label key={user.id} className="check-row">
                        <input type="checkbox" checked={selectedSet.has(user.id)} onChange={() => toggleUser(user.id)} />
                        <span>{user.displayName}</span>
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
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

function UserActivityLineChart({ user, report, startDate, endDate, expanded = false, onExpand }) {
  const hourly = sameDateRangeDay(startDate, endDate);
  const userDailyByDate = new Map((user?.activityByDay || []).map((item) => [item.date, item]));
  const reportDailyByDate = new Map((report?.activityByDay || []).map((item) => [item.date, item]));
  const userLoginHours = new Map((user?.loginHours || []).map((item) => [item.hour, item.logins || 0]));
  const userViewHours = new Map((user?.viewHours || []).map((item) => [item.hour, item.accesses || 0]));
  const reportViewHours = new Map((report?.viewHours || []).map((item) => [item.hour, item.accesses || 0]));
  const items = hourly
    ? Array.from({ length: 24 }, (_, hour) => ({
        key: String(hour),
        label: formatHourLabel(hour),
        views: report ? reportViewHours.get(hour) || 0 : userViewHours.get(hour) || 0,
        logins: userLoginHours.get(hour) || 0
      }))
    : (user?.activityByDay || []).map((item) => ({
        key: item.date,
        label: formatDayLabel(item.date),
        views: report ? reportDailyByDate.get(item.date)?.views || 0 : item.views || 0,
        logins: userDailyByDate.get(item.date)?.logins || 0
      }));
  const width = Math.max(expanded ? 920 : 420, items.length * (hourly ? 34 : 52));
  const height = expanded ? 360 : 210;
  const padding = { top: 24, right: 28, bottom: 48, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...items.flatMap((item) => [item.views || 0, item.logins || 0]));

  function pointFor(item, index, key) {
    const denominator = Math.max(1, items.length - 1);
    const x = padding.left + (index / denominator) * chartWidth;
    const y = padding.top + chartHeight - ((item[key] || 0) / maxValue) * chartHeight;
    return { x, y };
  }

  function buildPath(key) {
    if (!items.length) {
      return "";
    }

    return items
      .map((item, index) => {
        const point = pointFor(item, index, key);
        return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
      })
      .join(" ");
  }

  return (
    <div className={`analytics-user-line-card${expanded ? " is-expanded" : ""}`}>
      <div className="analytics-user-line-header">
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
        <span className="muted small">{hourly ? "Por hora" : "Por dia"}</span>
      </div>
      <div className="analytics-user-line-scroll">
        <svg
          className="analytics-user-line-chart"
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: `max(100%, ${width}px)` }}
          role="img"
          aria-label={hourly ? "Acessos por hora no periodo selecionado" : "Acessos por dia no periodo selecionado"}
        >
          {[0, 0.5, 1].map((tick) => {
            const y = padding.top + chartHeight - chartHeight * tick;
            return (
              <g key={tick}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="analytics-grid-line" />
                <text x={0} y={y + 4} className="analytics-axis-text analytics-axis-y">
                  {Math.round(maxValue * tick)}
                </text>
              </g>
            );
          })}

          <path d={buildPath("views")} className="analytics-line analytics-line-views" />
          <path d={buildPath("logins")} className="analytics-line analytics-line-logins" />

          {items.map((item, index) => {
            const viewPoint = pointFor(item, index, "views");
            const loginPoint = pointFor(item, index, "logins");
            const showLabel =
              expanded ||
              items.length <= 10 ||
              index === 0 ||
              index === items.length - 1 ||
              index % Math.ceil(items.length / 8) === 0;

            return (
              <g key={item.key}>
                <circle
                  cx={viewPoint.x}
                  cy={viewPoint.y}
                  r="4"
                  className="analytics-line-dot analytics-line-dot-views"
                />
                <circle
                  cx={loginPoint.x}
                  cy={loginPoint.y}
                  r="4"
                  className="analytics-line-dot analytics-line-dot-logins"
                />
                {showLabel ? (
                  <text x={viewPoint.x} y={height - 14} textAnchor="middle" className="analytics-axis-text analytics-axis-x">
                    {item.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="analytics-point-summary-list">
        {items.map((item) => (
          <div key={item.key} className="analytics-point-summary">
            <strong>{item.label}</strong>
            <span>{item.views || 0} ab.</span>
            <span>{item.logins || 0} log.</span>
          </div>
        ))}
      </div>
      {onExpand ? (
        <button type="button" className="secondary-btn compact-btn analytics-expand-chart-btn" onClick={onExpand}>
          Expandir grafico
        </button>
      ) : null}
    </div>
  );
}

function UserReportBreakdown({ user, selectedReportId, onSelectReport }) {
  const items = user?.reportBreakdown || [];
  const maxValue = Math.max(1, ...items.map((item) => item.accesses || 0));

  return (
    <div className="analytics-user-report-list">
      {items.length ? (
        items.slice(0, 8).map((item, index) => (
          <button
            key={item.reportId}
            type="button"
            className={`analytics-user-report-row${selectedReportId === item.reportId ? " is-selected" : ""}`}
            onClick={() => onSelectReport(item.reportId)}
          >
            <span className="analytics-rank-number">{index + 1}</span>
            <div className="analytics-user-report-main">
              <div className="analytics-row-head">
                <strong>{item.reportName}</strong>
                <span className="muted small">
                  {formatAccessLabel(item.accesses)} | {formatMinutes(item.averageMinutes)}
                </span>
              </div>
              <div className="analytics-bar-track">
                <div
                  className="analytics-bar-fill"
                  style={{ width: `${Math.max(6, ((item.accesses || 0) / maxValue) * 100)}%` }}
                />
              </div>
              <span className="muted small">{item.categoryName || "Sem categoria"}</span>
            </div>
          </button>
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

function UserDetailPanel({ user, startDate, endDate }) {
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [chartExpanded, setChartExpanded] = useState(false);

  useEffect(() => {
    setSelectedReportId(null);
    setChartExpanded(false);
  }, [user?.userId, startDate, endDate]);

  if (!user) {
    return (
      <article className="page-card analytics-card analytics-card-compact analytics-user-detail-empty">
        <h2>Resumo do usuario</h2>
        <p className="muted">Selecione um usuario no ranking para ver o detalhamento.</p>
      </article>
    );
  }

  const selectedReport = (user.reportBreakdown || []).find((report) => report.reportId === selectedReportId) || null;
  const totalActivity = getUserActivityTotal(user);
  const reportCoverage = user.uniqueReports ? `${user.uniqueReports} ${user.uniqueReports === 1 ? "painel" : "paineis"}` : "Nenhum painel";
  const patternTitle = selectedReport ? selectedReport.reportName : "Todos os paineis";
  const peakHour = selectedReport?.peakHour || user.peakHour;
  const peakHourAccesses = selectedReport?.peakHourAccesses ?? user.peakHourAccesses;
  const peakWeekday = selectedReport?.peakWeekday || user.peakWeekday;
  const peakWeekdayAccesses = selectedReport?.peakWeekdayAccesses ?? user.peakWeekdayAccesses;
  const firstActivityAt = selectedReport?.firstViewAt || user.firstActivityAt;
  const lastActivityAt = selectedReport?.lastViewAt || user.lastActivityAt;

  function handleSelectReport(reportId) {
    setSelectedReportId((current) => (current === reportId ? null : reportId));
  }

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
            <span className="muted small">{selectedReport ? "Filtrado" : user.topReportName}</span>
          </div>
          <UserReportBreakdown user={user} selectedReportId={selectedReport?.reportId || null} onSelectReport={handleSelectReport} />
        </div>

        <div className="analytics-user-panel">
          <div className="header-line">
            <h3>Padrao de uso</h3>
            <span className="tag-chip tag-chip-muted">{patternTitle}</span>
          </div>
          <div className="analytics-user-peak-grid">
            <div>
              <span className="muted small">Pico de painel</span>
              <strong>{peakHour}</strong>
              <span className="muted small">{formatWeekdayLabel(peakWeekday)} - {formatAccessLabel(peakWeekdayAccesses)}</span>
            </div>
            <div>
              <span className="muted small">Pico de login</span>
              <strong>{user.peakLoginHour}</strong>
              <span className="muted small">{formatWeekdayLabel(user.peakLoginWeekday)} - {formatLoginLabel(user.peakLoginWeekdayAccesses)}</span>
            </div>
            <div>
              <span className="muted small">Primeira atividade</span>
              <strong>{formatDateTime(firstActivityAt)}</strong>
            </div>
            <div>
              <span className="muted small">Ultima atividade</span>
              <strong>{formatDateTime(lastActivityAt)}</strong>
            </div>
          </div>
          <UserActivityLineChart
            user={user}
            report={selectedReport}
            startDate={startDate}
            endDate={endDate}
            onExpand={() => setChartExpanded(true)}
          />
        </div>
      </div>

      {chartExpanded ? (
        <div className="modal-backdrop analytics-chart-modal-backdrop" role="presentation" onClick={() => setChartExpanded(false)}>
          <section
            className="modal-card analytics-chart-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Grafico expandido"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">Padrao de uso</div>
                <h2>{patternTitle}</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setChartExpanded(false)} aria-label="Fechar grafico">
                x
              </button>
            </div>
            <UserActivityLineChart user={user} report={selectedReport} startDate={startDate} endDate={endDate} expanded />
          </section>
        </div>
      ) : null}
    </article>
  );
}

export default function ReportsAnalyticsPage() {
  const { token } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedFilterUserIds, setSelectedFilterUserIds] = useState(null);
  const [filters, setFilters] = useState(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10)
    };
  });

  async function loadAnalytics(currentFilters = filters, currentUserIds = selectedFilterUserIds) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: currentFilters.startDate,
        endDate: currentFilters.endDate
      });
      if (Array.isArray(currentUserIds)) {
        params.set("userIds", currentUserIds.join(","));
      }
      const payload = await apiJson(`/report-analytics?${params.toString()}`, { token });
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
    const availableUsers = data?.availableUsers || [];
    if (!data) {
      return;
    }
    if (!availableUsers.length) {
      setSelectedFilterUserIds([]);
      return;
    }

    const availableIds = availableUsers.map((user) => user.id);
    if (selectedFilterUserIds == null) {
      setSelectedFilterUserIds(availableIds);
      return;
    }

    const availableIdSet = new Set(availableIds);
    const sanitized = selectedFilterUserIds.filter((userId) => availableIdSet.has(userId));
    if (sanitized.length !== selectedFilterUserIds.length) {
      setSelectedFilterUserIds(sanitized);
    }
  }, [data?.availableUsers, selectedFilterUserIds]);

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
  const availableUsers = data?.availableUsers || [];
  const effectiveSelectedFilterUserIds =
    selectedFilterUserIds == null ? availableUsers.map((user) => user.id) : selectedFilterUserIds;

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
              loadAnalytics(filters, effectiveSelectedFilterUserIds);
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
            <div className="analytics-filter-field">
              <span>Usuarios/perfis</span>
              <UserProfileFilter
                users={availableUsers}
                selectedUserIds={effectiveSelectedFilterUserIds}
                onChange={setSelectedFilterUserIds}
              />
            </div>
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
        <UserDetailPanel user={selectedUser} startDate={data?.startDate || filters.startDate} endDate={data?.endDate || filters.endDate} />
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
