import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";

function formatWeekdayLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatWeekdayShort(value) {
  const normalized = value.toLowerCase();
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

  return mapping[normalized] || formatWeekdayLabel(value);
}

function formatMinutes(value) {
  if (value == null) {
    return "Sem base suficiente";
  }

  return `${String(value).replace(".", ",")} min`;
}

function formatAccessLabel(value) {
  return `${value} ${value === 1 ? "acesso" : "acessos"}`;
}

function buildChartTooltip(item, valueFormatter, labelFormatter) {
  const lines = [`${labelFormatter(item.label)}: ${valueFormatter(item.value)}`];

  if (item.users?.length) {
    item.users.forEach((user) => {
      lines.push(`${user.displayName}: ${formatAccessLabel(user.accesses)}`);
    });
  }

  return lines.join("\n");
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

function BarList({ title, items, valueFormatter, labelFormatter }) {
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <article className="page-card analytics-card analytics-card-compact">
      <div className="header-line">
        <h2>{title}</h2>
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

function VerticalBarChart({ title, items, valueFormatter, labelFormatter }) {
  const chartHeight = 190;
  const barWidth = 24;
  const gap = 12;
  const leftPadding = 38;
  const rightPadding = 18;
  const topPadding = 18;
  const bottomPadding = 54;
  const chartWidth = Math.max(420, leftPadding + rightPadding + items.length * (barWidth + gap));
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <article className="page-card analytics-card analytics-card-compact">
      <div className="header-line">
        <h2>{title}</h2>
      </div>
      {items.length ? (
        <div className="analytics-chart-shell">
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
              const height = maxValue ? (item.value / maxValue) * chartHeight : 0;
              const x = leftPadding + index * (barWidth + gap);
              const y = topPadding + chartHeight - height;
              return (
                <g key={item.key}>
                  <title>{buildChartTooltip(item, valueFormatter, labelFormatter)}</title>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(2, height)}
                    rx={7}
                    className="analytics-bar-vertical"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={topPadding + chartHeight + 20}
                    textAnchor="middle"
                    className="analytics-axis-text analytics-axis-x"
                  >
                    {labelFormatter(item.label)}
                  </text>
                </g>
              );
            })}
          </svg>
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
              <div className="analytics-user-primary">
                <strong>{user.displayName}</strong>
                <span className="muted small">{user.profileLabel || "Sem perfil"}</span>
              </div>
              <div className="analytics-user-metric">
                <span className="muted small">Total de acessos</span>
                <strong>{user.totalViews}</strong>
              </div>
              <div className="analytics-user-metric analytics-user-metric-wide">
                <span className="muted small">Painel mais acessado</span>
                <strong>{user.topReportName}</strong>
                <span className="muted small">{formatAccessLabel(user.topReportAccesses)}</span>
              </div>
              <div className="analytics-user-metric">
                <span className="muted small">Hora de pico</span>
                <strong>{user.peakHour}</strong>
                <span className="muted small">{formatAccessLabel(user.peakHourAccesses)}</span>
              </div>
              <div className="analytics-user-metric">
                <span className="muted small">Dia de pico</span>
                <strong>{formatWeekdayLabel(user.peakWeekday)}</strong>
                <span className="muted small">{formatAccessLabel(user.peakWeekdayAccesses)}</span>
              </div>
              <div className="analytics-user-metric">
                <span className="muted small">Paineis distintos</span>
                <strong>{user.uniqueReports}</strong>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">Nenhum usuario ativo acessou relatorios no periodo selecionado.</p>
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
        value: item.accesses,
        users: item.users || []
      })),
    [data]
  );

  const weekdayItems = useMemo(
    () =>
      (data?.accessesByWeekday || []).map((item) => ({
        key: item.weekday,
        label: item.weekday,
        value: item.accesses,
        users: item.users || []
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

      <section className="analytics-metrics-grid">
        <MetricCard
          label="Usuarios ativos"
          value={data?.summary?.activeUsers ?? 0}
          hint="Usuarios ativos que acessaram pelo menos um relatorio no periodo."
        />
        <MetricCard label="Acessos a relatorios" value={data?.summary?.totalViews ?? 0} />
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
          title="Ranking de relatorios mais acessados"
          items={rankingItems}
          valueFormatter={formatAccessLabel}
          labelFormatter={(label) => label}
        />
        <BarList
          title="Tempo medio estimado por relatorio"
          items={averageItems}
          valueFormatter={formatMinutes}
          labelFormatter={(label) => label}
        />
        <VerticalBarChart
          title="Acessos por hora"
          items={hourItems}
          valueFormatter={formatAccessLabel}
          labelFormatter={(label) => label}
        />
        <VerticalBarChart
          title="Acessos por dia da semana"
          items={weekdayItems}
          valueFormatter={formatAccessLabel}
          labelFormatter={formatWeekdayShort}
        />
      </section>

      <section className="analytics-stack">
        <UserStatsTable users={data?.userStats || []} />
        <BarList
          title="Categorias mais acessadas"
          items={categoryItems}
          valueFormatter={formatAccessLabel}
          labelFormatter={(label) => label}
        />
      </section>
    </div>
  );
}
