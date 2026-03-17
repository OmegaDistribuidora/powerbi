import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";

function buildNodes(categories, reports, users) {
  const categoryNodes = categories.map((category, index) => ({
    id: `category-${category.id}`,
    label: category.name,
    x: 120,
    y: 110 + index * 140,
    color: category.color || "#ff7b2c"
  }));

  const reportNodes = reports.map((report, index) => ({
    id: `report-${report.id}`,
    label: report.name,
    x: 420,
    y: 80 + index * 92,
    color: report.category?.color || "#8fa9ff"
  }));

  const userNodes = users.map((user, index) => ({
    id: `user-${user.id}`,
    label: user.displayName,
    x: 740,
    y: 80 + index * 92,
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

  const highlightedEdgeIds = useMemo(() => {
    if (!selectedNodeId) {
      return new Set(edges.map((edge) => edge.id));
    }

    return new Set(edges.filter((edge) => edge.from === selectedNodeId || edge.to === selectedNodeId).map((edge) => edge.id));
  }, [edges, selectedNodeId]);

  function isNodeHighlighted(nodeId) {
    if (!selectedNodeId) {
      return true;
    }

    if (nodeId === selectedNodeId) {
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
          <svg className="mapping-canvas" viewBox="0 0 980 980" role="img" aria-label="Mapeamento de categorias, painéis e usuários">
            {edges.map((edge) => {
              const from = nodes.find((node) => node.id === edge.from);
              const to = nodes.find((node) => node.id === edge.to);

              if (!from || !to) {
                return null;
              }

              return (
                <path
                  key={edge.id}
                  d={`M ${from.x + 96} ${from.y} C ${from.x + 200} ${from.y}, ${to.x - 80} ${to.y}, ${to.x - 8} ${to.y}`}
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
                <rect
                  x={node.x - 8}
                  y={node.y - 28}
                  width="200"
                  height="56"
                  rx="18"
                  fill="rgba(10, 22, 45, 0.94)"
                  stroke={node.color}
                  strokeWidth="1.5"
                />
                <circle cx={node.x + 18} cy={node.y} r="6" fill={node.color} />
                <text x={node.x + 34} y={node.y + 5} fill="currentColor">
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
