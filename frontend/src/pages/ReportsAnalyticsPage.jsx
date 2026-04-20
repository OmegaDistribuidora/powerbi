import { useEffect, useMemo, useRef, useState } from "react";
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

function DualVerticalBarChart({ title, items, labelFormatter }) {
  const shellRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const chartHeight = 190;
  const barWidth = 16;
  const innerGap = 6;
  const groupGap = 14;
  const leftPadding = 38;
  const rightPadding = 18;
  const topPadding = 18;
  const bottomPadding = 56;
  const groupWidth = barWidth * 2 + innerGap;
  const chartWidth = Math.max(420, leftPadding + rightPadding + items.length * (groupWidth + groupGap));
  const maxValue = Math.max(
    1,
    ...items.flatMap((item) => [item.reportAccesses || 0, item.logins || 0])
  );

  function handleTooltipMove(event, payload) {
    const shellRect = shellRef.current?.getBoundingClientRect();
    if (!shellRect) {
      return;
    }

    setTooltip({
      ...payload,
      x: event.clientX - shellRect.left + 16,
      y: event.clientY - shellRect.top - 16
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
        <div className="analytics-chart-shell" ref={shellRef}>
          <svg
            className="analytics-chart"
            viewBox={`0 0 ${chartWidth} ${chartHeight + topPadding + bottomPadding}`}
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
          {tooltip ? (
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
            </div>
          ) : null}
        </div>
      ) : (
        <p className="muted">Nenhum dado disponivel no periodo selecionado.</p>
      )}
    </article>
  );
}

function UserStatsTable({ users }) {
  return (
    <article className="page-card analytics-card analytics-full-span">
      <div className="header-line">
        <h2>Dados por usuario</h2>
      </div>
      {users.length ? (
        <div className="analytics-user-list">
          {users.map((user) => (
            <article key={user.userId} className="analytics-user-card">
              <div className="analytics-user-header">
                <strong>{user.displayName}</strong>
                <span className="muted small">{user.profileLabel || "Sem perfil"}</span>
              </div>

              <div className="analytics-user-metrics-grid">
                <div className="analytics-user-metric-box">
                  <span className="muted small">Aberturas de painel</span>
                  <strong>{user.totalViews}</strong>
                </div>
                <div className="analytics-user-metric-box">
                  <span className="muted small">Logins no sistema</span>
                  <strong>{user.totalLogins}</strong>
                </div>
                <div className="analytics-user-metric-box analytics-user-metric-box-wide">
                  <span className="muted small">Painel mais acessado</span>
                  <strong>{user.topReportName}</strong>
                  <span className="muted small">{formatAccessLabel(user.topReportAccesses)}</span>
                </div>
                <div className="analytics-user-metric-box">
                  <span className="muted small">Hora pico de painel</span>
                  <strong>{user.peakHour}</strong>
                  <span className="muted small">{formatAccessLabel(user.peakHourAccesses)}</span>
                </div>
                <div className="analytics-user-metric-box">
                  <span className="muted small">Hora pico de login</span>
                  <strong>{user.peakLoginHour}</strong>
                  <span className="muted small">{formatLoginLabel(user.peakLoginHourAccesses)}</span>
                </div>
                <div className="analytics-user-metric-box">
                  <span className="muted small">Dia pico de painel</span>
                  <strong>{formatWeekdayLabel(user.peakWeekday)}</strong>
                  <span className="muted small">{formatAccessLabel(user.peakWeekdayAccesses)}</span>
                </div>
                <div className="analytics-user-metric-box">
                  <span className="muted small">Dia pico de login</span>
                  <strong>{formatWeekdayLabel(user.peakLoginWeekday)}</strong>
                  <span className="muted small">{formatLoginLabel(user.peakLoginWeekdayAccesses)}</span>
                </div>
                <div className="analytics-user-metric-box">
                  <span className="muted small">Paineis distintos</span>
                  <strong>{user.uniqueReports}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">Nenhum usuario ativo gerou logins ou aberturas de painel no periodo selecionado.</p>
      )}
    </article>
  );
}

export default function ReportsAnalyticsPage() {
  const { token } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
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
        <DualVerticalBarChart title="Uso por hora" items={hourItems} labelFormatter={(label) => label} />
        <DualVerticalBarChart title="Uso por dia da semana" items={weekdayItems} labelFormatter={formatWeekdayShort} />
      </section>

      <section className="analytics-stack">
        <UserStatsTable users={data?.userStats || []} />
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
