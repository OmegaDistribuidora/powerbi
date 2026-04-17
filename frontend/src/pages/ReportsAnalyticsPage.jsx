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
    "terça-feira": "Ter",
    "quarta-feira": "Qua",
    "quinta-feira": "Qui",
    "sexta-feira": "Sex",
    sábado: "Sáb",
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
    <article className="page-card analytics-card">
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
          <p className="muted">Nenhum dado disponível no período selecionado.</p>
        )}
      </div>
    </article>
  );
}

function VerticalBarChart({ title, items, valueFormatter, labelFormatter }) {
  const chartHeight = 180;
  const barWidth = 22;
  const gap = 10;
  const leftPadding = 24;
  const rightPadding = 12;
  const topPadding = 18;
  const bottomPadding = 42;
  const chartWidth = Math.max(320, leftPadding + rightPadding + items.length * (barWidth + gap));
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <article className="page-card analytics-card">
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
                    x1={leftPadding - 6}
                    y1={y}
                    x2={chartWidth - rightPadding}
                    y2={y}
                    className="analytics-grid-line"
                  />
                  <text x={0} y={y + 4} className="analytics-axis-text">
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
                  <title>{`${labelFormatter(item.label)}: ${valueFormatter(item.value)}`}</title>
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
                    y={topPadding + chartHeight + 18}
                    textAnchor="middle"
                    className="analytics-axis-text"
                  >
                    {labelFormatter(item.label)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <p className="muted">Nenhum dado disponível no período selecionado.</p>
      )}
    </article>
  );
}

function UserStatsTable({ users }) {
  return (
    <article className="page-card analytics-card">
      <div className="header-line">
        <h2>Dados por usuário</h2>
      </div>
      {users.length ? (
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Total de acessos</th>
                <th>Painel mais acessado</th>
                <th>Hora de pico</th>
                <th>Dia de pico</th>
                <th>Painéis distintos</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <td>{user.displayName}</td>
                  <td>{user.profileLabel || "Sem perfil"}</td>
                  <td>{user.totalViews}</td>
                  <td>
                    {user.topReportName}
                    <span className="muted small"> · {user.topReportAccesses} acesso(s)</span>
                  </td>
                  <td>
                    {user.peakHour}
                    <span className="muted small"> · {user.peakHourAccesses}</span>
                  </td>
                  <td>
                    {formatWeekdayLabel(user.peakWeekday)}
                    <span className="muted small"> · {user.peakWeekdayAccesses}</span>
                  </td>
                  <td>{user.uniqueReports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Nenhum usuário ativo acessou relatórios no período selecionado.</p>
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
        value: item.accesses
      })),
    [data]
  );

  const weekdayItems = useMemo(
    () =>
      (data?.accessesByWeekday || []).map((item) => ({
        key: item.weekday,
        label: item.weekday,
        value: item.accesses
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
            <div className="eyebrow">Relatórios</div>
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
              Início
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
          label="Usuários ativos"
          value={data?.summary?.activeUsers ?? 0}
          hint="Usuários ativos que acessaram pelo menos um relatório no período."
        />
        <MetricCard label="Acessos a relatórios" value={data?.summary?.totalViews ?? 0} />
        <MetricCard
          label="Relatórios acessados"
          value={accessedReportsSummary}
          hint="Quantidade acessada no período sobre o total de relatórios ativos."
        />
        <MetricCard
          label="Tempo médio geral"
          value={formatMinutes(data?.summary?.averageMinutesOverall)}
          hint="Tempo estimado médio entre aberturas de relatórios."
        />
      </section>

      <section className="analytics-grid">
        <BarList
          title="Ranking de relatórios mais acessados"
          items={rankingItems}
          valueFormatter={(value) => `${value} acesso(s)`}
          labelFormatter={(label) => label}
        />
        <BarList
          title="Tempo médio estimado por relatório"
          items={averageItems}
          valueFormatter={formatMinutes}
          labelFormatter={(label) => label}
        />
        <VerticalBarChart
          title="Acessos por hora"
          items={hourItems}
          valueFormatter={(value) => `${value} acesso(s)`}
          labelFormatter={(label) => label}
        />
        <VerticalBarChart
          title="Acessos por dia da semana"
          items={weekdayItems}
          valueFormatter={(value) => `${value} acesso(s)`}
          labelFormatter={formatWeekdayShort}
        />
      </section>

      <section className="analytics-grid">
        <UserStatsTable users={data?.userStats || []} />
        <BarList
          title="Categorias mais acessadas"
          items={categoryItems}
          valueFormatter={(value) => `${value} acesso(s)`}
          labelFormatter={(label) => label}
        />
      </section>
    </div>
  );
}
