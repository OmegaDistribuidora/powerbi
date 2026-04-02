import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";

const LAYOUT = {
  categoryX: 44,
  reportX: 272,
  userX: 500,
  top: 48,
  rowGap: 42,
  categoryGap: 52,
  nodeWidth: 154,
  nodeHeight: 32,
  nodeRadius: 11,
  dotOffsetX: 14,
  labelOffsetX: 26,
  minCanvasWidth: 676
};

function truncateLabel(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildNodes(categories, reports, users) {
  const categoryNodes = categories.map((category, index) => ({
    id: `category-${category.id}`,
    label: truncateLabel(category.name, 18),
    fullLabel: category.name,
    x: LAYOUT.categoryX,
    y: LAYOUT.top + index * LAYOUT.categoryGap,
    color: category.color || "#ff7b2c"
  }));

  const reportNodes = reports.map((report, index) => ({
    id: `report-${report.id}`,
    label: truncateLabel(report.name, 19),
    fullLabel: report.name,
    x: LAYOUT.reportX,
    y: LAYOUT.top + index * LAYOUT.rowGap,
    color: report.category?.color || "#8fa9ff"
  }));

  const userNodes = users.map((user, index) => ({
    id: `user-${user.id}`,
    label: truncateLabel(user.displayName, 17),
    fullLabel: user.displayName,
    x: LAYOUT.userX,
    y: LAYOUT.top + index * LAYOUT.rowGap,
    color: user.active ? "#2ec27e" : "#9cb0d1"
  }));

  return [...categoryNodes, ...reportNodes, ...userNodes];
}

function buildEdges(reports, users) {
  const edges = [];

  reports.forEach((report) => {
    if (report.categoryId) {
      edges.push({
        id: `category-${report.categoryId}->report-${report.id}`,
        from: `category-${report.categoryId}`,
        to: `report-${report.id}`
      });
    }
  });

  users.forEach((user) => {
    (user.reportIds || []).forEach((reportId) => {
      edges.push({
        id: `report-${reportId}->user-${user.id}`,
        from: `report-${reportId}`,
        to: `user-${user.id}`
      });
    });
  });

  return edges;
}

function buildCanvasMetrics(categories, reports, users) {
  const tallestColumn = Math.max(
    categories.length ? LAYOUT.top + (categories.length - 1) * LAYOUT.categoryGap : 0,
    reports.length ? LAYOUT.top + (reports.length - 1) * LAYOUT.rowGap : 0,
    users.length ? LAYOUT.top + (users.length - 1) * LAYOUT.rowGap : 0
  );

  return {
    width: LAYOUT.minCanvasWidth,
    height: Math.max(360, tallestColumn + 56)
  };
}

export default function MappingPage() {
  const { token } = useAuth();
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      apiJson("/reports", { token }),
      apiJson("/users", { token }),
      apiJson("/report-categories", { token })
    ])
      .then(([reportsPayload, usersPayload, categoriesPayload]) => {
        if (!active) {
          return;
        }

        setReports(reportsPayload.reports || []);
        setUsers(usersPayload.users || []);
        setCategories(categoriesPayload.categories || []);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const nodes = useMemo(() => buildNodes(categories, reports, users), [categories, reports, users]);
  const edges = useMemo(() => buildEdges(reports, users), [reports, users]);
  const canvas = useMemo(() => buildCanvasMetrics(categories, reports, users), [categories, reports, users]);
  const nodeIndex = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const highlightedEdgeIds = useMemo(() => {
    if (!selectedNodeId) {
      return new Set(edges.map((edge) => edge.id));
    }

    return new Set(
      edges.filter((edge) => edge.from === selectedNodeId || edge.to === selectedNodeId).map((edge) => edge.id)
    );
  }, [edges, selectedNodeId]);

  function isNodeHighlighted(nodeId) {
    if (!selectedNodeId || nodeId === selectedNodeId) {
      return true;
    }

    return edges.some(
      (edge) =>
        highlightedEdgeIds.has(edge.id) &&
        ((edge.from === selectedNodeId && edge.to === nodeId) || (edge.to === selectedNodeId && edge.from === nodeId))
    );
  }

  if (error) {
    return <div className="page-card error-text">{error}</div>;
  }

  return (
    <div className="page-stack">
      <section className="page-card admin-toolbar-card">
        <div className="header-line">
          <div className="admin-toolbar-copy">
            <div className="eyebrow">Mapeamento</div>
            <h1>Mapeamento de painéis</h1>
          </div>
          {selectedNodeId ? (
            <button type="button" className="secondary-btn" onClick={() => setSelectedNodeId("")}>
              Limpar destaque
            </button>
          ) : null}
        </div>
      </section>

      <section className="page-card mapping-card">
        <div className="mapping-legend">
          <span className="mapping-legend-chip is-category">Categoria</span>
          <span className="mapping-legend-chip is-report">Painel</span>
          <span className="mapping-legend-chip is-user">Usuário</span>
        </div>

        <div className="mapping-scroll">
          <svg
            className="mapping-canvas"
            viewBox={`0 0 ${canvas.width} ${canvas.height}`}
            role="img"
            aria-label="Mapeamento de categorias, painéis e usuários"
          >
            {edges.map((edge) => {
              const from = nodeIndex.get(edge.from);
              const to = nodeIndex.get(edge.to);

              if (!from || !to) {
                return null;
              }

              return (
                <path
                  key={edge.id}
                  d={`M ${from.x + LAYOUT.nodeWidth - 3} ${from.y} C ${from.x + LAYOUT.nodeWidth + 42} ${from.y}, ${to.x - 44} ${to.y}, ${to.x - 4} ${to.y}`}
                  className={`mapping-edge ${highlightedEdgeIds.has(edge.id) ? "is-highlighted" : "is-dimmed"}`}
                />
              );
            })}

            {nodes.map((node) => (
              <g
                key={node.id}
                className={`mapping-node ${isNodeHighlighted(node.id) ? "is-highlighted" : "is-dimmed"}`}
                onClick={() => setSelectedNodeId((current) => (current === node.id ? "" : node.id))}
                role="button"
              >
                <title>{node.fullLabel}</title>
                <rect
                  x={node.x}
                  y={node.y - LAYOUT.nodeHeight / 2}
                  width={LAYOUT.nodeWidth}
                  height={LAYOUT.nodeHeight}
                  rx={LAYOUT.nodeRadius}
                  fill="rgba(10, 22, 45, 0.96)"
                  stroke={node.color}
                  strokeWidth="1.15"
                />
                <circle cx={node.x + LAYOUT.dotOffsetX} cy={node.y} r="4.1" fill={node.color} />
                <text x={node.x + LAYOUT.labelOffsetX} y={node.y + 4} fill="currentColor">
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </section>
    </div>
  );
}
