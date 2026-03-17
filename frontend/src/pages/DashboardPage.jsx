import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

  const friendlyDate = useMemo(() => {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date());
  }, []);

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
          <p className="muted">Hoje e {friendlyDate}.</p>
          <p className="muted">Selecione um painel a esquerda para acessar!</p>
        </div>
      </section>

      {data.homeCards?.length ? (
        <section className="dashboard-card-grid">
          {data.homeCards.map((card) => {
            const isExternal = /^https?:\/\//i.test(card.actionUrl || "");
            const actionLabel = card.actionLabel?.trim() || "Abrir";

            return (
              <article key={card.id} className="dashboard-home-card">
                {card.imageUrl ? (
                  <div className="dashboard-home-card-image">
                    <img src={card.imageUrl} alt={card.title} />
                  </div>
                ) : null}

                <div className="dashboard-home-card-body">
                  <h2>{card.title}</h2>
                  {card.description ? <p>{card.description}</p> : null}

                  {card.actionUrl ? (
                    isExternal ? (
                      <a
                        href={card.actionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="secondary-btn compact-btn dashboard-card-action"
                      >
                        {actionLabel}
                      </a>
                    ) : (
                      <Link to={card.actionUrl} className="secondary-btn compact-btn dashboard-card-action">
                        {actionLabel}
                      </Link>
                    )
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
