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
          <p className="muted">Selecione um painel a esquerda para acessar!</p>
        </div>
      </section>
    </div>
  );
}
