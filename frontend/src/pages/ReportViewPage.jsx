import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { microsoftConfig } from "../config";
import { apiJson } from "../services/api";
import { getMicrosoftAccount, getPowerBiAccessToken } from "../services/microsoftAuth";

let powerbiLibraryPromise = null;
let powerbiServicePromise = null;

async function getPowerBiLibrary() {
  if (!powerbiLibraryPromise) {
    powerbiLibraryPromise = import("powerbi-client");
  }

  return powerbiLibraryPromise;
}

async function getPowerBiService() {
  if (!powerbiServicePromise) {
    powerbiServicePromise = getPowerBiLibrary().then(({ factories, service }) => {
      return new service.Service(factories.hpmFactory, factories.wpmpFactory, factories.routerFactory);
    });
  }

  return powerbiServicePromise;
}

function normalizeFilterValue(rawValue) {
  const value = String(rawValue).trim();

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }

  return value;
}

function buildReportFilters(filterRules, powerBiModels) {
  return filterRules.map((rule) => ({
    $schema: "http://powerbi.com/product/schema#basic",
    filterType: powerBiModels.FilterType.Basic,
    target: {
      table: rule.tableName,
      column: rule.columnName
    },
    operator: "In",
    requireSingleSelection: true,
    values: [normalizeFilterValue(rule.value)]
  }));
}

function buildEmbedUrl(report) {
  if (report.embedUrl) {
    return report.embedUrl;
  }

  if (!report.workspaceId || !report.reportKey) {
    return "";
  }

  const params = new URLSearchParams({
    reportId: report.reportKey,
    groupId: report.workspaceId,
    autoAuth: "true"
  });

  if (microsoftConfig.tenantId) {
    params.set("ctid", microsoftConfig.tenantId);
  }

  return `https://app.powerbi.com/reportEmbed?${params.toString()}`;
}

function hasGroupIdInUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.searchParams.has("groupId");
  } catch {
    return /[?&]groupId=/.test(url);
  }
}

function shouldUseSecureIframe(report) {
  return Boolean(report?.embedUrl && !hasGroupIdInUrl(report.embedUrl));
}

function formatFilterValueForUrl(rawValue) {
  const normalized = normalizeFilterValue(rawValue);

  if (typeof normalized === "number" || typeof normalized === "boolean") {
    return String(normalized);
  }

  return `'${String(normalized).replace(/'/g, "''")}'`;
}

function buildSecureIframeUrl(report, filterRules) {
  const baseUrl = report?.embedUrl || buildEmbedUrl(report);
  if (!baseUrl) {
    return "";
  }

  const parsed = new URL(baseUrl);
  parsed.searchParams.set("autoAuth", "true");
  parsed.searchParams.set("chromeless", "true");

  if (microsoftConfig.tenantId && !parsed.searchParams.has("ctid")) {
    parsed.searchParams.set("ctid", microsoftConfig.tenantId);
  }

  if (filterRules.length) {
    const expression = filterRules
      .map((rule) => `${rule.tableName}/${rule.columnName} eq ${formatFilterValueForUrl(rule.value)}`)
      .join(" and ");

    parsed.searchParams.set("filter", expression);
  } else {
    parsed.searchParams.delete("filter");
  }

  return parsed.toString();
}

function formatPowerBiApiError(response, payload) {
  const apiMessage =
    payload?.error?.message ||
    payload?.message ||
    payload?.error_description ||
    payload?.errorCode ||
    payload?.error;

  const apiCode = payload?.error?.code || payload?.errorCode || payload?.code;
  const statusLabel = response?.status ? `HTTP ${response.status}` : "HTTP desconhecido";

  if (apiCode && apiMessage) {
    return `${statusLabel} - ${apiCode}: ${apiMessage}`;
  }

  if (apiMessage) {
    return `${statusLabel} - ${apiMessage}`;
  }

  return `${statusLabel} - Nao foi possivel consultar o relatorio no Power BI.`;
}

async function fetchReportMetadata(report, accessToken) {
  if (report.embedUrl) {
    return {
      embedUrl: report.embedUrl,
      datasetId: report.datasetId || null,
      source: "saved-embed-url"
    };
  }

  if (!report.workspaceId || !report.reportKey) {
    return {
      embedUrl: buildEmbedUrl(report),
      datasetId: report.datasetId || null
    };
  }

  const response = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${report.workspaceId}/reports/${report.reportKey}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const fallbackEmbedUrl = buildEmbedUrl(report);
    if (fallbackEmbedUrl) {
      return {
        embedUrl: fallbackEmbedUrl,
        datasetId: report.datasetId || null,
        source: "fallback-embed-url",
        warning: formatPowerBiApiError(response, payload)
      };
    }

    throw new Error(formatPowerBiApiError(response, payload));
  }

  return {
    embedUrl: payload?.embedUrl || buildEmbedUrl(report),
    datasetId: payload?.datasetId || report.datasetId || null,
    source: "powerbi-api"
  };
}

export default function ReportViewPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [embedError, setEmbedError] = useState("");
  const [embedStatus, setEmbedStatus] = useState("idle");
  const [microsoftAccount, setMicrosoftAccount] = useState(null);
  const [resolvedEmbed, setResolvedEmbed] = useState(null);
  const containerRef = useRef(null);
  const powerbiServiceRef = useRef(null);
  const embeddedReportRef = useRef(null);
  const [diagnostics, setDiagnostics] = useState({
    requestedRules: [],
    requestedFilters: [],
    appliedFilters: [],
    activePage: null,
    pageFilters: [],
    apiMetadata: null,
    events: [],
    lastError: ""
  });

  const embedUrl = useMemo(() => {
    if (resolvedEmbed?.embedUrl) {
      return resolvedEmbed.embedUrl;
    }

    return data ? buildEmbedUrl(data.report) : "";
  }, [data, resolvedEmbed]);

  const secureIframeMode = useMemo(() => (data ? shouldUseSecureIframe(data.report) : false), [data]);

  const secureIframeUrl = useMemo(() => {
    if (!data || !secureIframeMode) {
      return "";
    }

    return buildSecureIframeUrl(data.report, data.filters || []);
  }, [data, secureIframeMode]);

  useEffect(() => {
    let active = true;

    apiJson(`/reports/${id}/view`, { token })
      .then((payload) => {
        if (active) {
          setData(payload);
          setResolvedEmbed(null);
          setDiagnostics({
            requestedRules: payload.filters || [],
            requestedFilters: [],
            appliedFilters: [],
            activePage: null,
            pageFilters: [],
            apiMetadata: null,
            events: [],
            lastError: ""
          });
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
  }, [id, token]);

  useEffect(() => {
    let active = true;

    if (!microsoftConfig.isConfigured) {
      return undefined;
    }

    getMicrosoftAccount()
      .then((account) => {
        if (active) {
          setMicrosoftAccount(account);
        }
      })
      .catch(() => {
        if (active) {
          setMicrosoftAccount(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (containerRef.current && powerbiServiceRef.current) {
        powerbiServiceRef.current.reset(containerRef.current);
      }
      embeddedReportRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function embedReport() {
      if (!data) {
        return;
      }

      if (secureIframeMode) {
        setResolvedEmbed({
          embedUrl: secureIframeUrl,
          datasetId: data.report.datasetId || null,
          source: "secure-iframe"
        });
        setEmbedError("");
        setEmbedStatus("rendered");
        setDiagnostics((current) => ({
          ...current,
          requestedRules: data.filters || [],
          requestedFilters: data.filters || [],
          appliedFilters: [],
          activePage: null,
          pageFilters: [],
          apiMetadata: {
            embedUrl: secureIframeUrl,
            datasetId: data.report.datasetId || null,
            source: "secure-iframe"
          },
          lastError: "",
          events: ["Painel carregado em modo secure iframe com filtros por URL."]
        }));
        return;
      }

      if (!containerRef.current) {
        return;
      }

      if (!microsoftConfig.isConfigured) {
        setEmbedStatus("needs-config");
        return;
      }

      if (!embedUrl || !data.report.reportKey) {
        setEmbedStatus("missing-config");
        return;
      }

      setEmbedStatus("authenticating");
      setEmbedError("");

      try {
        const { accessToken, account } = await getPowerBiAccessToken({ interactive: false });
        const powerbiService = await getPowerBiService();
        const powerbiLibrary = await getPowerBiLibrary();

        if (cancelled || !containerRef.current) {
          return;
        }

        setMicrosoftAccount(account || null);

        if (!accessToken) {
          setEmbedStatus("login-required");
          return;
        }

        const metadata = await fetchReportMetadata(data.report, accessToken);
        if (cancelled) {
          return;
        }

        setResolvedEmbed(metadata);
        if (!metadata.embedUrl) {
          setEmbedStatus("missing-config");
          return;
        }

        powerbiServiceRef.current = powerbiService;
        powerbiService.reset(containerRef.current);

        const filters = buildReportFilters(data.filters, powerbiLibrary.models);
        setDiagnostics((current) => ({
          ...current,
          requestedRules: data.filters,
          requestedFilters: filters,
          apiMetadata: metadata,
          appliedFilters: [],
          activePage: null,
          pageFilters: [],
          lastError: "",
          events: [
            ...current.events,
            metadata?.source === "saved-embed-url"
              ? "Embed URL salva do painel foi usada diretamente."
              : metadata?.source === "fallback-embed-url"
                ? `Consulta da API do Power BI falhou; usando Embed URL direta. ${metadata.warning}`
                : "Metadata do relatorio carregada pela API do Power BI."
          ]
        }));

        const embeddedReport = powerbiService.embed(containerRef.current, {
          type: "report",
          id: data.report.reportKey,
          embedUrl: metadata.embedUrl,
          accessToken,
          tokenType: powerbiLibrary.models.TokenType.Aad,
          permissions: powerbiLibrary.models.Permissions.Read,
          filters,
          settings: {
            panes: {
              filters: { visible: false, expanded: false },
              bookmarks: { visible: false },
              pageNavigation: { visible: false }
            },
            persistentFiltersEnabled: false,
            layoutType: powerbiLibrary.models.LayoutType.Custom,
            customLayout: {
              displayOption: powerbiLibrary.models.DisplayOption.FitToPage
            },
            background: powerbiLibrary.models.BackgroundType.Default
          }
        });

        embeddedReportRef.current = embeddedReport;
        setEmbedStatus("loading");

        embeddedReport.off("loaded");
        embeddedReport.off("rendered");
        embeddedReport.off("error");

        embeddedReport.on("loaded", async () => {
          try {
            setDiagnostics((current) => ({
              ...current,
              events: [...current.events, "Evento loaded recebido do Power BI."]
            }));

            if (filters.length) {
              await embeddedReport.setFilters(filters);
            }

            const appliedFilters = await embeddedReport.getFilters();
            const activePage = await embeddedReport.getActivePage();
            let pageFilters = [];

            if (activePage) {
              await activePage.setFilters(filters);
              pageFilters = await activePage.getFilters();
            }

            setDiagnostics((current) => ({
              ...current,
              appliedFilters,
              activePage: activePage
                ? {
                    name: activePage.name,
                    displayName: activePage.displayName,
                    isActive: activePage.isActive
                  }
                : null,
              pageFilters,
              events: [
                ...current.events,
                filters.length
                  ? `setFilters executado com ${filters.length} filtro(s).`
                  : "Nenhum filtro configurado para enviar ao relatorio.",
                activePage
                  ? `Filtros reaplicados tambem na pagina ativa: ${activePage.displayName || activePage.name}.`
                  : "Nao foi possivel identificar a pagina ativa."
              ]
            }));

            if (!cancelled) {
              setEmbedStatus("loaded");
            }
          } catch (filterError) {
            if (!cancelled) {
              setEmbedStatus("error");
              setEmbedError(`O relatorio abriu, mas os filtros nao puderam ser aplicados: ${filterError.message}`);
              setDiagnostics((current) => ({
                ...current,
                lastError: filterError.message,
                events: [...current.events, `Erro ao aplicar filtros: ${filterError.message}`]
              }));
            }
          }
        });

        embeddedReport.on("rendered", () => {
          if (!cancelled) {
            setEmbedStatus("rendered");
            setDiagnostics((current) => ({
              ...current,
              events: [...current.events, "Evento rendered recebido do Power BI."]
            }));
          }
        });

        embeddedReport.on("error", (event) => {
          if (!cancelled) {
            setEmbedStatus("error");
            const eventMessage = event?.detail?.message || "Falha ao carregar o relatorio do Power BI.";
            setEmbedError(eventMessage);
            setDiagnostics((current) => ({
              ...current,
              lastError: eventMessage,
              events: [...current.events, `Erro do Power BI: ${eventMessage}`]
            }));
          }
        });
      } catch (authError) {
        if (!cancelled) {
          setEmbedStatus("error");
          const authMessage =
            authError.message ||
            "Nao foi possivel autenticar no Power BI. Verifique o app do Microsoft Entra e a permissao do usuario.";
          setEmbedError(authMessage);
          setDiagnostics((current) => ({
            ...current,
            lastError: authMessage,
            events: [...current.events, `Erro de autenticacao: ${authMessage}`]
          }));
        }
      }
    }

    embedReport();

    return () => {
      cancelled = true;
    };
  }, [data, embedUrl, secureIframeMode, secureIframeUrl]);

  async function handleReconnectMicrosoft() {
    setEmbedError("");
    setEmbedStatus("idle");

    if (containerRef.current && powerbiServiceRef.current) {
      powerbiServiceRef.current.reset(containerRef.current);
    }

    try {
      const { account } = await getPowerBiAccessToken({ interactive: true });
      setMicrosoftAccount(account || null);
      setData((current) => (current ? { ...current } : current));
    } catch (authError) {
      setEmbedStatus("error");
      setEmbedError(authError.message || "Falha ao iniciar o login Microsoft.");
    }
  }

  async function handleRefreshDiagnostics() {
    if (!embeddedReportRef.current) {
      return;
    }

    try {
      const appliedFilters = await embeddedReportRef.current.getFilters();
      const activePage = await embeddedReportRef.current.getActivePage();
      const pageFilters = activePage ? await activePage.getFilters() : [];
      setDiagnostics((current) => ({
        ...current,
        appliedFilters,
        activePage: activePage
          ? {
              name: activePage.name,
              displayName: activePage.displayName,
              isActive: activePage.isActive
            }
          : null,
        pageFilters,
        events: [...current.events, "Diagnostico atualizado manualmente com getFilters()."]
      }));
    } catch (refreshError) {
      setDiagnostics((current) => ({
        ...current,
        lastError: refreshError.message,
        events: [...current.events, `Falha ao consultar filtros ativos: ${refreshError.message}`]
      }));
    }
  }

  if (error) {
    return <div className="page-card error-text">{error}</div>;
  }

  if (!data) {
    return <div className="page-card">Carregando painel...</div>;
  }

  return (
    <div className="report-workspace">
      <section className="page-card report-main-card">
        {secureIframeMode ? (
          <iframe
            title={data.report.name}
            src={secureIframeUrl}
            className="report-embed-frame report-embed-large"
            style={{ border: "none" }}
            allowFullScreen
          />
        ) : !microsoftConfig.isConfigured ? (
          <div className="embed-placeholder">
            <p className="error-text">
              Defina VITE_MICROSOFT_CLIENT_ID e VITE_MICROSOFT_TENANT_ID no frontend para habilitar o Power BI.
            </p>
          </div>
        ) : !embedUrl ? (
          <div className="embed-placeholder">
            <p className="error-text">Este painel ainda nao tem configuracao suficiente para embed.</p>
          </div>
        ) : (
          <div ref={containerRef} className="report-embed-frame report-embed-large" />
        )}
      </section>

      <details className="page-card report-details-card">
        <summary>Detalhes do painel</summary>

        <section className="report-meta-card">
          <div className="report-toolbar">
            <div className="report-toolbar-left">
              <Link to="/" className="inline-link">
                &larr; Voltar
              </Link>
              <div className="report-title-block">
                <div className="eyebrow">Painel</div>
                <strong>{data.report.name}</strong>
              </div>
              <span className={`pill ${embedStatus === "rendered" || embedStatus === "loaded" ? "is-success" : "is-muted"}`}>
                {embedStatus === "authenticating" && "Autenticando"}
                {embedStatus === "loading" && "Carregando"}
                {embedStatus === "loaded" && "Filtrando"}
                {embedStatus === "rendered" && "Pronto"}
                {embedStatus === "error" && "Erro"}
                {embedStatus === "login-required" && "Login Microsoft"}
                {(embedStatus === "idle" || embedStatus === "missing-config" || embedStatus === "needs-config") && "Aguardando"}
              </span>
            </div>
            {microsoftConfig.isConfigured ? (
              <button type="button" className="ghost-btn compact-btn" onClick={handleReconnectMicrosoft}>
                {microsoftAccount ? "Trocar conta Microsoft" : "Entrar com Microsoft"}
              </button>
            ) : null}
          </div>

          <div className="report-meta-line">
            <span className="muted small">
              {microsoftAccount?.username ? `Conta Microsoft: ${microsoftAccount.username}` : "Nenhuma conta Microsoft conectada ainda."}
            </span>
            {embedStatus === "login-required" ? (
              <span className="muted small">
                Clique em <strong>Entrar com Microsoft</strong> para autorizar o Power BI e carregar este painel.
              </span>
            ) : null}
          </div>

          {embedError ? <p className="error-text">{embedError}</p> : null}
        </section>

        <section className="report-support-grid">
          <section className="side-panel-card">
            <div className="eyebrow">Filtros</div>
            {!data.filters.length ? (
              <p className="muted">Nenhuma regra configurada para este usuario/painel.</p>
            ) : (
              <div className="rules-list">
                {data.filters.map((rule) => (
                  <div key={rule.id} className="rule-card">
                    <strong>
                      {rule.tableName}.{rule.columnName}
                    </strong>
                    <span>Valor: {rule.value}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="side-panel-card">
            <div className="eyebrow">Configuracao</div>
            <div className="side-meta-list">
              <div>
                <span className="muted small">Modo de exibicao</span>
                <strong>{secureIframeMode ? "Secure iframe" : "Power BI Client"}</strong>
              </div>
            </div>
          </section>

          <section className="side-panel-card">
            <details className="embed-details">
              <summary>Diagnostico</summary>
              <div className="inline-actions">
                <button type="button" className="secondary-btn" onClick={handleRefreshDiagnostics}>
                  Atualizar
                </button>
              </div>
              <div className="diagnostic-grid">
                <div>
                  <span className="muted small">Payload</span>
                  <pre>{JSON.stringify(diagnostics.requestedFilters, null, 2)}</pre>
                </div>
                <div>
                  <span className="muted small">Filtros ativos</span>
                  <pre>{JSON.stringify(diagnostics.appliedFilters, null, 2)}</pre>
                </div>
                <div>
                  <span className="muted small">Pagina ativa</span>
                  <pre>{JSON.stringify(diagnostics.activePage, null, 2)}</pre>
                </div>
                <div>
                  <span className="muted small">Filtros da pagina</span>
                  <pre>{JSON.stringify(diagnostics.pageFilters, null, 2)}</pre>
                </div>
              </div>
              {diagnostics.lastError ? <p className="error-text">Ultimo erro: {diagnostics.lastError}</p> : null}
            </details>
          </section>
        </section>
      </details>
    </div>
  );
}
