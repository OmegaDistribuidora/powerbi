import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { apiJson } from "../services/api";

const emptyReport = {
  name: "",
  description: "",
  workspaceId: "",
  reportKey: "",
  datasetId: "",
  categoryId: "",
  embedUrl: "",
  filterableFields: [],
  active: true
};

const emptyCategory = {
  name: "",
  color: "#ff7b2c",
  sortOrder: 0
};

const emptyUser = {
  username: "",
  displayName: "",
  profileLabel: "",
  password: "",
  role: "USER",
  active: true,
  reportIds: [],
  filterRules: []
};

function blankRule() {
  return {
    _key: crypto.randomUUID(),
    reportId: null,
    tableName: "",
    columnName: "",
    value: ""
  };
}

function blankField() {
  return {
    _key: crypto.randomUUID(),
    tableName: "",
    columnName: ""
  };
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon">
      <path
        d="M4 15.5V20h4.5L19 9.5 14.5 5 4 15.5zm12.8-11.3 2.5 2.5 1.1-1.1a1.8 1.8 0 0 0 0-2.5l-1-1a1.8 1.8 0 0 0-2.5 0l-1.1 1.1z"
        fill="currentColor"
      />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon">
      <path
        d="M11 3h2v9h-2V3zm1 18a8 8 0 0 1-5.7-13.6l1.4 1.4A6 6 0 1 0 16.3 8.8l1.4-1.4A8 8 0 0 1 12 21z"
        fill="currentColor"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon">
      <path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11z"
        fill="currentColor"
      />
    </svg>
  );
}

function extractPowerBiEmbedData(embedUrl) {
  const value = String(embedUrl || "").trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const reportId = url.searchParams.get("reportId") || "";
    const workspaceId = url.searchParams.get("groupId") || "";

    if (reportId || workspaceId) {
      return { reportId, workspaceId };
    }

    const groupsMatch = url.pathname.match(/\/groups\/([^/]+)\/reports\/([^/?]+)/i);
    if (groupsMatch) {
      return {
        workspaceId: groupsMatch[1] || "",
        reportId: groupsMatch[2] || ""
      };
    }
  } catch (error) {
    return null;
  }

  return null;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">Administracao</div>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            x
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function AdminPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [userForm, setUserForm] = useState(emptyUser);
  const [reportForm, setReportForm] = useState(emptyReport);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingReportId, setEditingReportId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    const [usersPayload, reportsPayload, categoriesPayload] = await Promise.all([
      apiJson("/users", { token }),
      apiJson("/reports", { token }),
      apiJson("/report-categories", { token })
    ]);
    setUsers(usersPayload.users);
    setReports(reportsPayload.reports);
    setCategories(categoriesPayload.categories);
  }

  useEffect(() => {
    loadData().catch((requestError) => setError(requestError.message));
  }, [token]);

  const reportUsersMap = useMemo(() => {
    return reports.reduce((accumulator, report) => {
      accumulator[report.id] = users.filter((user) => user.reportIds.includes(report.id));
      return accumulator;
    }, {});
  }, [reports, users]);

  const reportFieldMap = useMemo(() => {
    return reports.reduce((accumulator, report) => {
      accumulator[report.id] = report.filterableFields || [];
      return accumulator;
    }, {});
  }, [reports]);

  function reportNamesForUser(user) {
    return reports.filter((report) => user.reportIds.includes(report.id)).map((report) => report.name);
  }

  function availableFieldOptions(rule) {
    const selectedReportIds = rule.reportId ? [Number(rule.reportId)] : userForm.reportIds;
    const merged = new Map();

    selectedReportIds.forEach((reportId) => {
      (reportFieldMap[reportId] || []).forEach((field) => {
        const key = `${field.tableName}::${field.columnName}`;
        merged.set(key, field);
      });
    });

    return Array.from(merged.values()).sort((a, b) => {
      if (a.tableName === b.tableName) {
        return a.columnName.localeCompare(b.columnName);
      }
      return a.tableName.localeCompare(b.tableName);
    });
  }

  function availableTables(rule) {
    return Array.from(new Set(availableFieldOptions(rule).map((field) => field.tableName)));
  }

  function availableColumns(rule) {
    return availableFieldOptions(rule)
      .filter((field) => field.tableName === rule.tableName)
      .map((field) => field.columnName);
  }

  function closeUserModal() {
    setUserModalOpen(false);
    setEditingUserId(null);
    setUserForm(emptyUser);
  }

  function closeReportModal() {
    setReportModalOpen(false);
    setEditingReportId(null);
    setReportForm(emptyReport);
  }

  function closeCategoryModal() {
    setCategoryModalOpen(false);
    setEditingCategoryId(null);
    setCategoryForm(emptyCategory);
  }

  function openNewUserModal() {
    setError("");
    setNotice("");
    setEditingUserId(null);
    setUserForm(emptyUser);
    setUserModalOpen(true);
  }

  function openNewReportModal() {
    setError("");
    setNotice("");
    setEditingReportId(null);
    setReportForm(emptyReport);
    setReportModalOpen(true);
  }

  function openNewCategoryModal() {
    setError("");
    setNotice("");
    setEditingCategoryId(null);
    setCategoryForm(emptyCategory);
    setCategoryModalOpen(true);
  }

  async function handleSaveReport(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const payload = buildReportPayload(reportForm);

      if (editingReportId) {
        await apiJson(`/reports/${editingReportId}`, {
          token,
          method: "PUT",
          data: payload
        });
      } else {
        await apiJson("/reports", {
          token,
          method: "POST",
          data: payload
        });
      }

      await loadData();
      closeReportModal();
      setNotice("Painel salvo com sucesso.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSaveCategory(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const payload = {
        name: categoryForm.name.trim(),
        color: categoryForm.color,
        sortOrder: Number(categoryForm.sortOrder) || 0
      };

      if (editingCategoryId) {
        await apiJson(`/report-categories/${editingCategoryId}`, {
          token,
          method: "PUT",
          data: payload
        });
      } else {
        await apiJson("/report-categories", {
          token,
          method: "POST",
          data: payload
        });
      }

      await loadData();
      closeCategoryModal();
      setNotice("Categoria salva com sucesso.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSaveUser(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const payload = buildUserPayload(userForm);

      if (editingUserId) {
        await apiJson(`/users/${editingUserId}`, {
          token,
          method: "PUT",
          data: payload
        });
      } else {
        await apiJson("/users", {
          token,
          method: "POST",
          data: payload
        });
      }

      await loadData();
      closeUserModal();
      setNotice("Usuario salvo com sucesso.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function toggleUserReport(reportId) {
    setUserForm((current) => {
      const nextReportIds = current.reportIds.includes(reportId)
        ? current.reportIds.filter((id) => id !== reportId)
        : [...current.reportIds, reportId];

      const nextRules = current.filterRules.map((rule) => {
        if (!rule.reportId) {
          const fields = nextReportIds.flatMap((id) => reportFieldMap[id] || []);
          const stillValid = fields.some(
            (field) => field.tableName === rule.tableName && field.columnName === rule.columnName
          );
          return stillValid ? rule : { ...rule, tableName: "", columnName: "" };
        }
        return rule;
      });

      return {
        ...current,
        reportIds: nextReportIds,
        filterRules: nextRules
      };
    });
  }

  function updateFilterRule(index, patch) {
    setUserForm((current) => ({
      ...current,
      filterRules: current.filterRules.map((rule, ruleIndex) => {
        if (ruleIndex !== index) {
          return rule;
        }

        const nextRule = { ...rule, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, "reportId")) {
          nextRule.tableName = "";
          nextRule.columnName = "";
        }
        if (Object.prototype.hasOwnProperty.call(patch, "tableName")) {
          nextRule.columnName = "";
        }

        return nextRule;
      })
    }));
  }

  function addFilterRule() {
    setUserForm((current) => ({
      ...current,
      filterRules: [...current.filterRules, blankRule()]
    }));
  }

  function removeFilterRule(index) {
    setUserForm((current) => ({
      ...current,
      filterRules: current.filterRules.filter((_, ruleIndex) => ruleIndex !== index)
    }));
  }

  function addFilterableField() {
    setReportForm((current) => ({
      ...current,
      filterableFields: [...current.filterableFields, blankField()]
    }));
  }

  function updateFilterableField(index, patch) {
    setReportForm((current) => ({
      ...current,
      filterableFields: current.filterableFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      )
    }));
  }

  function removeFilterableField(index) {
    setReportForm((current) => ({
      ...current,
      filterableFields: current.filterableFields.filter((_, fieldIndex) => fieldIndex !== index)
    }));
  }

  function startEditingUser(user) {
    setError("");
    setNotice("");
    setEditingUserId(user.id);
    setUserForm({
      username: user.username,
      displayName: user.displayName,
      profileLabel: user.profileLabel || "",
      password: "",
      role: user.role,
      active: user.active,
      reportIds: user.reportIds || [],
      filterRules: (user.filterRules || []).map((rule) => ({
        _key: crypto.randomUUID(),
        reportId: rule.reportId ?? null,
        tableName: rule.tableName,
        columnName: rule.columnName,
        value: rule.value
      }))
    });
    setUserModalOpen(true);
  }

  function startEditingReport(report) {
    setError("");
    setNotice("");
    setEditingReportId(report.id);
    setReportForm({
      name: report.name,
      description: report.description || "",
      workspaceId: report.workspaceId || "",
      reportKey: report.reportKey || "",
      datasetId: report.datasetId || "",
      categoryId: report.categoryId ? String(report.categoryId) : "",
      embedUrl: report.embedUrl || "",
      filterableFields: (report.filterableFields || []).map((field) => ({
        _key: crypto.randomUUID(),
        tableName: field.tableName,
        columnName: field.columnName
      })),
      active: report.active
    });
    setReportModalOpen(true);
  }

  function startEditingCategory(category) {
    setError("");
    setNotice("");
    setEditingCategoryId(category.id);
    setCategoryForm({
      name: category.name,
      color: category.color,
      sortOrder: category.sortOrder ?? 0
    });
    setCategoryModalOpen(true);
  }

  function buildReportPayload(form) {
    return {
      ...form,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      filterableFields: form.filterableFields
        .filter((field) => field.tableName && field.columnName)
        .map((field) => ({
          tableName: field.tableName.trim(),
          columnName: field.columnName.trim()
        }))
    };
  }

  function handleEmbedUrlChange(value) {
    setReportForm((current) => {
      const extracted = extractPowerBiEmbedData(value);
      return {
        ...current,
        embedUrl: value,
        reportKey: extracted?.reportId || current.reportKey,
        workspaceId: extracted?.workspaceId || current.workspaceId
      };
    });
  }

  function buildUserPayload(form) {
    return {
      ...form,
      filterRules: form.filterRules
        .filter((rule) => rule.tableName && rule.columnName && rule.value)
        .map((rule) => ({
          reportId: rule.reportId ? Number(rule.reportId) : null,
          tableName: rule.tableName,
          columnName: rule.columnName,
          value: rule.value
        }))
    };
  }

  async function toggleReportActive(report) {
    setError("");
    setNotice("");

    const actionLabel = report.active ? "inativar" : "ativar";
    if (!window.confirm(`Confirma ${actionLabel} o painel "${report.name}"?`)) {
      return;
    }

    try {
      await apiJson(`/reports/${report.id}`, {
        token,
        method: "PUT",
        data: buildReportPayload({
          name: report.name,
          description: report.description || "",
          workspaceId: report.workspaceId || "",
          reportKey: report.reportKey || "",
          datasetId: report.datasetId || "",
          categoryId: report.categoryId ? String(report.categoryId) : "",
          embedUrl: report.embedUrl || "",
          filterableFields: report.filterableFields || [],
          active: !report.active
        })
      });
      await loadData();
      setNotice(`Painel ${!report.active ? "ativado" : "inativado"} com sucesso.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function toggleUserActive(user) {
    setError("");
    setNotice("");

    const actionLabel = user.active ? "inativar" : "ativar";
    if (!window.confirm(`Confirma ${actionLabel} o usuario "${user.displayName}"?`)) {
      return;
    }

    try {
      await apiJson(`/users/${user.id}`, {
        token,
        method: "PUT",
        data: buildUserPayload({
          username: user.username,
          displayName: user.displayName,
          profileLabel: user.profileLabel || "",
          password: "",
          role: user.role,
          active: !user.active,
          reportIds: user.reportIds || [],
          filterRules: (user.filterRules || []).map((rule) => ({
            reportId: rule.reportId ?? null,
            tableName: rule.tableName,
            columnName: rule.columnName,
            value: rule.value
          }))
        })
      });
      await loadData();
      setNotice(`Usuario ${!user.active ? "ativado" : "inativado"} com sucesso.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-card admin-toolbar-card">
        <div className="header-line">
          <div className="admin-toolbar-copy">
            <div className="eyebrow">Administracao</div>
            <h1>Usuarios, paineis e filtros</h1>
          </div>
          <div className="inline-actions">
            <button type="button" className="secondary-btn" onClick={openNewCategoryModal}>
              Nova categoria
            </button>
            <button type="button" className="secondary-btn" onClick={openNewReportModal}>
              Novo painel
            </button>
            <button type="button" className="primary-btn" onClick={openNewUserModal}>
              Novo usuario
            </button>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {notice ? <p className="success-text">{notice}</p> : null}
      </section>

      <section className="page-card">
        <div className="header-line">
          <h2>Categorias</h2>
          <span className="muted small">{categories.length} categoria(s)</span>
        </div>
        {!categories.length ? (
          <p className="muted">Nenhuma categoria cadastrada.</p>
        ) : (
          <div className="category-admin-grid">
            {categories.map((category) => (
              <article key={category.id} className="admin-item-card admin-item-card-compact">
                <div className="admin-item-header">
                  <div>
                    <strong className="category-title-inline" style={{ color: category.color }}>
                      {category.name}
                    </strong>
                    <p className="muted small">Ordem: {category.sortOrder}</p>
                  </div>
                  <div className="admin-item-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => startEditingCategory(category)}
                      aria-label={`Editar categoria ${category.name}`}
                    >
                      <FolderIcon />
                    </button>
                  </div>
                </div>
                <div className="related-block">
                  <span className="muted small">Paineis nesta categoria</span>
                  {category.reports?.length ? (
                    <div className="tag-list">
                      {category.reports.map((report) => (
                        <span key={`${category.id}-${report.id}`} className="tag-chip">
                          {report.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">Nenhum painel vinculado.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-overview-grid">
        <article className="page-card">
          <div className="header-line">
            <h2>Paineis cadastrados</h2>
            <span className="muted small">{reports.length} painel(is)</span>
          </div>
          {!reports.length ? (
            <p className="muted">Nenhum painel cadastrado.</p>
          ) : (
            <div className="stack-list">
              {reports.map((report) => {
                const allowedUsers = reportUsersMap[report.id] || [];
                return (
                  <article key={report.id} className="admin-item-card">
                    <div className="admin-item-header">
                      <div>
                        <strong>{report.name}</strong>
                        <p className="muted small">{report.category?.name || "Sem categoria"}</p>
                      </div>
                      <div className="admin-item-actions">
                        <span className={`status-dot ${report.active ? "is-success" : "is-muted"}`}>
                          {report.active ? "Ativo" : "Inativo"}
                        </span>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => toggleReportActive(report)}
                          aria-label={`${report.active ? "Inativar" : "Ativar"} painel ${report.name}`}
                        >
                          <PowerIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => startEditingReport(report)}
                          aria-label={`Editar painel ${report.name}`}
                        >
                          <PencilIcon />
                        </button>
                      </div>
                    </div>
                    <div className="related-block">
                      <span className="muted small">Usuarios com acesso</span>
                      {allowedUsers.length ? (
                        <div className="tag-list">
                          {allowedUsers.map((user) => (
                            <span key={user.id} className="tag-chip">
                              {user.displayName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="muted small">Nenhum usuario vinculado.</p>
                      )}
                    </div>
                    <div className="related-block">
                      <span className="muted small">Campos permitidos para filtro</span>
                      {(report.filterableFields || []).length ? (
                        <div className="tag-list">
                          {report.filterableFields.map((field) => (
                            <span key={`${report.id}-${field.tableName}-${field.columnName}`} className="tag-chip">
                              {field.tableName}.{field.columnName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="muted small">Nenhum campo configurado.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>

        <article className="page-card">
          <div className="header-line">
            <h2>Usuarios cadastrados</h2>
            <span className="muted small">{users.length} usuario(s)</span>
          </div>
          {!users.length ? (
            <p className="muted">Nenhum usuario cadastrado.</p>
          ) : (
            <div className="stack-list">
              {users.map((user) => {
                const availableReports = reportNamesForUser(user);
                return (
                  <article key={user.id} className="admin-item-card">
                    <div className="admin-item-header">
                      <div>
                        <strong>{user.displayName}</strong>
                        <p className="muted small">
                          {user.username} · {user.role === "ADMIN" ? "Administrador" : "Usuario"}
                        </p>
                      </div>
                      <div className="admin-item-actions">
                        <span className={`status-dot ${user.active ? "is-success" : "is-muted"}`}>
                          {user.active ? "Ativo" : "Inativo"}
                        </span>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => toggleUserActive(user)}
                          aria-label={`${user.active ? "Inativar" : "Ativar"} usuario ${user.displayName}`}
                        >
                          <PowerIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => startEditingUser(user)}
                          aria-label={`Editar usuario ${user.displayName}`}
                        >
                          <PencilIcon />
                        </button>
                      </div>
                    </div>
                    <div className="related-block">
                      <span className="muted small">Paineis liberados</span>
                      {availableReports.length ? (
                        <div className="tag-list">
                          {availableReports.map((reportName) => (
                            <span key={`${user.id}-${reportName}`} className="tag-chip">
                              {reportName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="muted small">Nenhum painel vinculado.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </section>

      {reportModalOpen ? (
        <Modal title={editingReportId ? "Editar painel" : "Novo painel"} onClose={closeReportModal}>
          <form className="form-stack" onSubmit={handleSaveReport}>
            <label>
              Nome
              <input
                value={reportForm.name}
                onChange={(event) => setReportForm({ ...reportForm, name: event.target.value })}
                required
              />
            </label>

            <label>
              Descricao
              <input
                value={reportForm.description}
                onChange={(event) => setReportForm({ ...reportForm, description: event.target.value })}
              />
            </label>

            <label>
              Embed URL
              <input
                value={reportForm.embedUrl}
                onChange={(event) => handleEmbedUrlChange(event.target.value)}
                placeholder="https://app.powerbi.com/reportEmbed?reportId=...&autoAuth=true&ctid=..."
              />
            </label>
            <p className="muted small">
              Use o link de Arquivo &gt; Inserir relatorio &gt; Site ou portal.
            </p>

            <label>
              Categoria
              <select
                value={reportForm.categoryId}
                onChange={(event) => setReportForm({ ...reportForm, categoryId: event.target.value })}
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend>Tabelas e colunas filtraveis</legend>
              <div className="form-stack compact">
                {reportForm.filterableFields.map((field, index) => (
                  <div key={field._key} className="rule-editor">
                    <input
                      placeholder="Tabela"
                      value={field.tableName}
                      onChange={(event) => updateFilterableField(index, { tableName: event.target.value })}
                    />
                    <input
                      placeholder="Coluna"
                      value={field.columnName}
                      onChange={(event) => updateFilterableField(index, { columnName: event.target.value })}
                    />
                    <button type="button" className="secondary-btn" onClick={() => removeFilterableField(index)}>
                      Remover
                    </button>
                  </div>
                ))}
                <button type="button" className="secondary-btn" onClick={addFilterableField}>
                  Adicionar campo filtravel
                </button>
              </div>
            </fieldset>

            <label className="check-row">
              <input
                type="checkbox"
                checked={reportForm.active}
                onChange={(event) => setReportForm({ ...reportForm, active: event.target.checked })}
              />
              <span>Painel ativo</span>
            </label>

            <div className="inline-actions">
              <button type="submit" className="primary-btn">
                Salvar painel
              </button>
              <button type="button" className="secondary-btn" onClick={closeReportModal}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {userModalOpen ? (
        <Modal title={editingUserId ? "Editar usuario" : "Novo usuario"} onClose={closeUserModal}>
          <form className="form-stack" onSubmit={handleSaveUser}>
            <label>
              Login
              <input
                value={userForm.username}
                onChange={(event) => setUserForm({ ...userForm, username: event.target.value })}
                required
              />
            </label>

            <label>
              Nome de exibicao
              <input
                value={userForm.displayName}
                onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })}
                required
              />
            </label>

            <label>
              Perfil de negocio
              <input
                value={userForm.profileLabel}
                onChange={(event) => setUserForm({ ...userForm, profileLabel: event.target.value })}
                placeholder="Supervisor, Coordenador..."
              />
            </label>

            <label>
              {editingUserId ? "Nova senha (opcional)" : "Senha"}
              <input
                type="password"
                value={userForm.password}
                onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                required={!editingUserId}
              />
            </label>

            <label>
              Permissao
              <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
                <option value="USER">Usuario</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={userForm.active}
                onChange={(event) => setUserForm({ ...userForm, active: event.target.checked })}
              />
              <span>Usuario ativo</span>
            </label>

            <fieldset>
              <legend>Paineis liberados</legend>
              <div className="check-grid">
                {reports.map((report) => (
                  <label key={report.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={userForm.reportIds.includes(report.id)}
                      onChange={() => toggleUserReport(report.id)}
                    />
                    <span>{report.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Regras de filtro</legend>
              <div className="form-stack compact">
                {userForm.filterRules.map((rule, index) => {
                  const tables = availableTables(rule);
                  const columns = availableColumns(rule);
                  return (
                    <div key={rule._key} className="filter-rule-row">
                      <select
                        value={rule.reportId ?? ""}
                        onChange={(event) =>
                          updateFilterRule(index, {
                            reportId: event.target.value ? Number(event.target.value) : null
                          })
                        }
                      >
                        <option value="">Todos os paineis selecionados</option>
                        {reports
                          .filter((report) => userForm.reportIds.includes(report.id))
                          .map((report) => (
                            <option key={report.id} value={report.id}>
                              {report.name}
                            </option>
                          ))}
                      </select>
                      <select
                        value={rule.tableName}
                        onChange={(event) => updateFilterRule(index, { tableName: event.target.value })}
                        disabled={!tables.length}
                      >
                        <option value="">{tables.length ? "Selecione a tabela" : "Sem tabelas disponiveis"}</option>
                        {tables.map((tableName) => (
                          <option key={tableName} value={tableName}>
                            {tableName}
                          </option>
                        ))}
                      </select>
                      <select
                        value={rule.columnName}
                        onChange={(event) => updateFilterRule(index, { columnName: event.target.value })}
                        disabled={!rule.tableName || !columns.length}
                      >
                        <option value="">{columns.length ? "Selecione a coluna" : "Sem colunas disponiveis"}</option>
                        {columns.map((columnName) => (
                          <option key={columnName} value={columnName}>
                            {columnName}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Valor"
                        value={rule.value}
                        onChange={(event) => updateFilterRule(index, { value: event.target.value })}
                      />
                      <button type="button" className="secondary-btn" onClick={() => removeFilterRule(index)}>
                        Remover
                      </button>
                    </div>
                  );
                })}

                <button type="button" className="secondary-btn" onClick={addFilterRule}>
                  Adicionar regra
                </button>
                <p className="muted small">
                  As tabelas e colunas disponiveis aqui sao definidas no cadastro do painel.
                </p>
              </div>
            </fieldset>

            <div className="inline-actions">
              <button type="submit" className="primary-btn">
                Salvar usuario
              </button>
              <button type="button" className="secondary-btn" onClick={closeUserModal}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {categoryModalOpen ? (
        <Modal title={editingCategoryId ? "Editar categoria" : "Nova categoria"} onClose={closeCategoryModal}>
          <form className="form-stack" onSubmit={handleSaveCategory}>
            <label>
              Nome
              <input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                required
              />
            </label>

            <label>
              Cor do titulo
              <input
                type="color"
                value={categoryForm.color}
                onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
              />
            </label>

            <label>
              Ordem
              <input
                type="number"
                min="0"
                value={categoryForm.sortOrder}
                onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: event.target.value })}
              />
            </label>

            <div className="inline-actions">
              <button type="submit" className="primary-btn">
                Salvar categoria
              </button>
              <button type="button" className="secondary-btn" onClick={closeCategoryModal}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
