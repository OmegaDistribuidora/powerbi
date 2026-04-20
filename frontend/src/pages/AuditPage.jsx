import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";

const FORTALEZA_TZ = "America/Fortaleza";
const PAGE_SIZE = 30;
const LOGIN_ACTIONS = new Set(["LOGIN", "SSO_LOGIN"]);

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon">
      <path
        d="M12 5c5.5 0 9.5 4.5 10.8 6.3.3.4.3 1 0 1.4C21.5 14.5 17.5 19 12 19S2.5 14.5 1.2 12.7a1.2 1.2 0 0 1 0-1.4C2.5 9.5 6.5 5 12 5zm0 2C8 7 4.8 10 3.3 12 4.8 14 8 17 12 17s7.2-3 8.7-5C19.2 10 16 7 12 7zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z"
        fill="currentColor"
      />
    </svg>
  );
}

function isLoginEvent(log) {
  return LOGIN_ACTIONS.has(log.action);
}

function isViewReportEvent(log) {
  return log.action === "VIEW_REPORT";
}

function canInspectDetails(log) {
  return !isLoginEvent(log);
}

function shouldShowBefore(log) {
  return !isLoginEvent(log) && !isViewReportEvent(log) && log.before != null;
}

function actionTone(action) {
  if (LOGIN_ACTIONS.has(action)) return "is-login";
  if (action === "VIEW_REPORT") return "is-view";
  if (action.includes("PASSWORD")) return "is-password";
  if (action.includes("CATEGORY")) return "is-category";
  if (action.includes("REPORT")) return "is-report";
  if (action.includes("USER") || action.includes("HOME_CARD")) return "is-user";
  return "is-default";
}

function formatAuditDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FORTALEZA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(value) {
  return JSON.stringify(value);
}

function normalizeAuditValue(value, stripId = false) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeAuditValue(item, true))
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        if (stripId && key === "id") {
          return accumulator;
        }

        accumulator[key] = normalizeAuditValue(value[key], false);
        return accumulator;
      }, {});
  }

  return value ?? null;
}

function buildChangedPair(before, after) {
  const normalizedBefore = normalizeAuditValue(before);
  const normalizedAfter = normalizeAuditValue(after);

  if (stableStringify(normalizedBefore) === stableStringify(normalizedAfter)) {
    return null;
  }

  if (Array.isArray(normalizedBefore) || Array.isArray(normalizedAfter)) {
    return { before: normalizedBefore, after: normalizedAfter };
  }

  if (isPlainObject(normalizedBefore) && isPlainObject(normalizedAfter)) {
    const beforeResult = {};
    const afterResult = {};
    const keys = Array.from(new Set([...Object.keys(normalizedBefore), ...Object.keys(normalizedAfter)])).sort();

    keys.forEach((key) => {
      const childDiff = buildChangedPair(normalizedBefore[key], normalizedAfter[key]);
      if (!childDiff) return;
      beforeResult[key] = childDiff.before;
      afterResult[key] = childDiff.after;
    });

    if (!Object.keys(beforeResult).length && !Object.keys(afterResult).length) {
      return null;
    }

    return { before: beforeResult, after: afterResult };
  }

  return { before: normalizedBefore, after: normalizedAfter };
}

function AuditDetailsModal({ log, onClose }) {
  const showBefore = shouldShowBefore(log);
  const afterLabel = isViewReportEvent(log) ? "Detalhes da visualização" : "Novo valor";
  const changedPair = showBefore ? buildChangedPair(log.before, log.after) : null;
  const resolvedBefore = changedPair?.before ?? null;
  const resolvedAfter = changedPair?.after ?? log.after;
  const hasRelevantChanges = !showBefore || Boolean(changedPair);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes da auditoria"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">Auditoria</div>
            <h2>{log.summary}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            x
          </button>
        </div>

        <div className="audit-meta-grid">
          <div className="audit-meta-item">
            <span className="muted small">Data:</span>
            <strong>{formatAuditDate(log.createdAt)}</strong>
          </div>
          <div className="audit-meta-item">
            <span className="muted small">Usuário:</span>
            <strong>{log.actorDisplayName || log.actorUsername || "Sistema"}</strong>
          </div>
          <div className="audit-meta-item">
            <span className="muted small">Ação:</span>
            <strong>{log.action}</strong>
          </div>
          <div className="audit-meta-item">
            <span className="muted small">Entidade:</span>
            <strong>{isLoginEvent(log) ? "Login" : `${log.entityType}${log.entityId ? ` #${log.entityId}` : ""}`}</strong>
          </div>
        </div>

        <div className="audit-detail-grid">
          {showBefore && hasRelevantChanges ? (
            <div>
              <span className="muted small">Valor anterior</span>
              <pre>{JSON.stringify(resolvedBefore, null, 2)}</pre>
            </div>
          ) : null}
          <div className={showBefore && hasRelevantChanges ? "" : "audit-detail-full"}>
            <span className="muted small">{afterLabel}</span>
            <pre>
              {hasRelevantChanges
                ? JSON.stringify(resolvedAfter, null, 2)
                : "Nenhuma alteração relevante foi detectada entre o valor anterior e o novo valor."}
            </pre>
          </div>
        </div>

        {log.metadata ? (
          <div>
            <span className="muted small">Metadados</span>
            <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AuditList({ logs, emptyMessage, showInspect }) {
  if (!logs.length) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div className="audit-list">
      {logs.map((log) => (
        <article key={log.id} className="audit-row">
          <div className="audit-row-main">
            <strong>{log.summary}</strong>
            <span className="muted small">
              {formatAuditDate(log.createdAt)} · {log.actorDisplayName || log.actorUsername || "Sistema"} · {log.action}
            </span>
          </div>
          <div className="audit-row-side">
            <span className={`tag-chip audit-action-chip ${actionTone(log.action)}`}>{log.action}</span>
            <span className="tag-chip">{isLoginEvent(log) ? "Login" : `${log.entityType}${log.entityId ? ` #${log.entityId}` : ""}`}</span>
            {showInspect && canInspectDetails(log) ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => showInspect(log)}
                aria-label={`Ver detalhes da ação ${log.summary}`}
              >
                <EyeIcon />
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function MoreButton({ visible, loading, onClick }) {
  if (!visible) {
    return null;
  }

  return (
    <button type="button" className="secondary-btn audit-more-btn" onClick={onClick} disabled={loading}>
      {loading ? "Carregando..." : "Mostrar mais"}
    </button>
  );
}

export default function AuditPage() {
  const { token } = useAuth();
  const [period, setPeriod] = useState("week");
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [loginState, setLoginState] = useState({ logs: [], offset: 0, total: 0, hasMore: false, loading: false });
  const [actionState, setActionState] = useState({ logs: [], offset: 0, total: 0, hasMore: false, loading: false });

  async function loadLogs(kind, offset = 0, append = false) {
    const setter = kind === "logins" ? setLoginState : setActionState;

    setter((current) => ({ ...current, loading: true }));

    try {
      const payload = await apiJson(
        `/audit?kind=${kind}&period=${period}&offset=${offset}&limit=${PAGE_SIZE}`,
        { token }
      );

      setter((current) => ({
        logs: append ? [...current.logs, ...(payload.logs || [])] : payload.logs || [],
        offset: (payload.offset || 0) + (payload.logs?.length || 0),
        total: payload.total || 0,
        hasMore: Boolean(payload.hasMore),
        loading: false
      }));
      setError("");
    } catch (requestError) {
      setter((current) => ({ ...current, loading: false }));
      setError(requestError.message);
    }
  }

  useEffect(() => {
    setSelectedLog(null);
    loadLogs("logins", 0, false);
    loadLogs("actions", 0, false);
  }, [period, token]);

  if (error) {
    return <div className="page-card error-text">{error}</div>;
  }

  return (
    <div className="page-stack">
      <section className="page-card admin-toolbar-card">
        <div className="header-line">
          <div className="admin-toolbar-copy">
            <div className="eyebrow">Auditoria</div>
            <h1>Histórico completo de ações</h1>
          </div>
          <select className="audit-period-select" value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="today">Hoje</option>
            <option value="week">Semana</option>
          </select>
        </div>
      </section>

      <section className="admin-overview-grid">
        <article className="page-card">
          <div className="header-line">
            <h2>Logins</h2>
            <span className="muted small">{loginState.total} registro(s)</span>
          </div>
          <AuditList logs={loginState.logs} emptyMessage="Nenhum login auditado neste período." />
          <MoreButton visible={loginState.hasMore} loading={loginState.loading} onClick={() => loadLogs("logins", loginState.offset, true)} />
        </article>

        <article className="page-card">
          <div className="header-line">
            <h2>Ações</h2>
            <span className="muted small">{actionState.total} registro(s)</span>
          </div>
          <AuditList logs={actionState.logs} emptyMessage="Nenhuma ação auditada neste período." showInspect={setSelectedLog} />
          <MoreButton visible={actionState.hasMore} loading={actionState.loading} onClick={() => loadLogs("actions", actionState.offset, true)} />
        </article>
      </section>

      {selectedLog ? <AuditDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} /> : null}
    </div>
  );
}
