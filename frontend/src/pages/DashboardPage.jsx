import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";

export default function DashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiJson("/dashboard", { token })
      .then((payload) => {
        if (active) {
          setData(payload);
        }
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

  if (error) {
    return <div className="page-card error-text">{error}</div>;
  }

  if (!data) {
    return <div className="page-card">Carregando painel...</div>;
  }

  return (
    <div className="page-stack">
      <section className="page-card hero-card">
        <div>
          <div className="eyebrow">Bem-vindo</div>
          <h1>{data.user.displayName}</h1>
          <p className="muted">Escolha um painel liberado para abrir o Power BI.</p>
        </div>
      </section>

      <section className="page-card">
        <h2>Filtros do meu usuario</h2>
        {!data.filters.length ? (
          <p className="muted">Nenhuma regra de filtro cadastrada.</p>
        ) : (
          <div className="rules-list">
            {data.filters.map((rule) => (
              <div key={rule.id} className="rule-card">
                <strong>
                  {rule.tableName}.{rule.columnName}
                </strong>
                <span className="muted small">
                  {rule.reportId ? `Somente no painel #${rule.reportId}` : "Todos os paineis"}
                </span>
                <span>Valor: {rule.value}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
