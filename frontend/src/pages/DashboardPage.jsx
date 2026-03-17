import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";

export default function DashboardPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
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

  function openCardAction(actionUrl) {
    if (!actionUrl) {
      return;
    }

    const isExternal = /^https?:\/\//i.test(actionUrl);
    if (isExternal) {
      window.open(actionUrl, "_blank", "noopener,noreferrer");
      return;
    }

    navigate(actionUrl);
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
            const isClickable = Boolean(card.actionUrl);

            return (
              <article
                key={card.id}
                className={`dashboard-home-card ${isClickable ? "is-clickable" : ""}`}
                role={isClickable ? "link" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => openCardAction(card.actionUrl) : undefined}
                onKeyDown={
                  isClickable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCardAction(card.actionUrl);
                        }
                      }
                    : undefined
                }
              >
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
                        onClick={(event) => event.stopPropagation()}
                      >
                        {actionLabel}
                      </a>
                    ) : (
                      <Link
                        to={card.actionUrl}
                        className="secondary-btn compact-btn dashboard-card-action"
                        onClick={(event) => event.stopPropagation()}
                      >
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
