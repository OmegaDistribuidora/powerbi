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
  userAssignments: [],
  active: true
};

const emptyCategory = {
  name: "",
  color: "#ff7b2c",
  sortOrder: 0
};

const emptyHomeCard = {
  title: "",
  description: "",
  imageUrl: "",
  actionLabel: "",
  actionUrl: "",
  sortOrder: 0,
  userIds: [],
  active: true
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

const adminSections = [
  { id: "home", label: "Home inicial", singular: "card" },
  { id: "categories", label: "Categorias", singular: "categoria" },
  { id: "reports", label: "Painéis", singular: "painel" },
  { id: "users", label: "Usuários", singular: "usuário" }
];

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

function blankAssignmentRule() {
  return {
    _key: crypto.randomUUID(),
    fieldKey: "",
    tableName: "",
    columnName: "",
    value: ""
  };
}

function blankAssignment() {
  return {
    _key: crypto.randomUUID(),
    userId: "",
    filterRules: []
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

function shortenText(value, maxLength = 90) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

function summarizeLink(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./i, "");
    const path = url.pathname === "/" ? "" : url.pathname;
    const summary = `${host}${path}`;
    return shortenText(summary, 72);
  } catch (error) {
    return shortenText(text, 72);
  }
}

function getUserProfileLabel(user) {
  return String(user?.profileLabel || "").trim() || "Sem perfil";
}

function getReportCategoryLabel(report) {
  return report?.category?.name || "Sem categoria";
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
            <div className="eyebrow">Administração</div>
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
  const { token, user: authUser } = useAuth();
  const [homeCards, setHomeCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [homeCardForm, setHomeCardForm] = useState(emptyHomeCard);
  const [userForm, setUserForm] = useState(emptyUser);
  const [reportForm, setReportForm] = useState(emptyReport);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [editingHomeCardId, setEditingHomeCardId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingReportId, setEditingReportId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [homeCardModalOpen, setHomeCardModalOpen] = useState(false);
  const [homeCardUploadError, setHomeCardUploadError] = useState("");
  const [homeCardUploading, setHomeCardUploading] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("categories");
  const [userProfileFilter, setUserProfileFilter] = useState("ALL");
  const [reportCategoryFilter, setReportCategoryFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    const [homeCardsPayload, usersPayload, reportsPayload, categoriesPayload] = await Promise.all([
      apiJson("/home-cards", { token }),
      apiJson("/users", { token }),
      apiJson("/reports", { token }),
      apiJson("/report-categories", { token })
    ]);
    setHomeCards(homeCardsPayload.cards);
    setUsers(usersPayload.users);
    setReports(reportsPayload.reports);
    setCategories(categoriesPayload.categories);
  }

  useEffect(() => {
    loadData().catch((requestError) => setError(requestError.message));
  }, [token]);

  const reportUsersMap = useMemo(() => {
    return reports.reduce((accumulator, report) => {
      accumulator[report.id] = users.filter((user) => user.role !== "ADMIN" && user.reportIds.includes(report.id));
      return accumulator;
    }, {});
  }, [reports, users]);

  const reportFieldMap = useMemo(() => {
    return reports.reduce((accumulator, report) => {
      accumulator[report.id] = report.filterableFields || [];
      return accumulator;
    }, {});
  }, [reports]);

  const activeReports = useMemo(() => reports.filter((report) => report.active), [reports]);

  const activeReportIds = useMemo(() => new Set(activeReports.map((report) => report.id)), [activeReports]);

  const assignableUsers = useMemo(() => {
    return users
      .filter((user) => user.active && user.role !== "ADMIN")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users]);

  const userProfileOptions = useMemo(() => {
    return Array.from(
      new Set(
        users
          .filter((user) => user.role !== "ADMIN")
          .map((user) => getUserProfileLabel(user))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const usersGroupedByProfile = useMemo(() => {
    const groups = new Map();
    assignableUsers.forEach((user) => {
      const key = getUserProfileLabel(user);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(user);
    });
    return Array.from(groups.entries())
      .map(([label, items]) => ({
        label,
        items: items.sort((a, b) => a.displayName.localeCompare(b.displayName))
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [assignableUsers]);

  const reportsGroupedByCategory = useMemo(() => {
    const groups = new Map();
    reports.forEach((report) => {
      const key = report.category?.id ? `category-${report.category.id}` : "uncategorized";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: getReportCategoryLabel(report),
          color: report.category?.color || "",
          sortOrder: report.category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
          items: []
        });
      }
      groups.get(key).items.push(report);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.label.localeCompare(b.label);
      });
  }, [reports]);

  const activeReportsGroupedByCategory = useMemo(() => {
    const groups = new Map();
    activeReports.forEach((report) => {
      const key = report.category?.id ? `category-${report.category.id}` : "uncategorized";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: getReportCategoryLabel(report),
          color: report.category?.color || "",
          sortOrder: report.category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
          items: []
        });
      }
      groups.get(key).items.push(report);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.label.localeCompare(b.label);
      });
  }, [activeReports]);

  const reportCategoryOptions = useMemo(
    () => reportsGroupedByCategory.map((group) => ({ key: group.key, label: group.label })),
    [reportsGroupedByCategory]
  );

  const filteredReportsGroupedByCategory = useMemo(() => {
    if (reportCategoryFilter === "ALL") {
      return reportsGroupedByCategory;
    }

    return reportsGroupedByCategory.filter((group) => group.key === reportCategoryFilter);
  }, [reportCategoryFilter, reportsGroupedByCategory]);

  const filteredReportsCount = useMemo(
    () => filteredReportsGroupedByCategory.reduce((total, group) => total + group.items.length, 0),
    [filteredReportsGroupedByCategory]
  );

  const filteredUsersForAdminSection = useMemo(() => {
    return users.filter((user) => {
      if (userProfileFilter === "ALL") {
        return true;
      }
      if (user.role === "ADMIN") {
        return false;
      }
      return getUserProfileLabel(user) === userProfileFilter;
    });
  }, [userProfileFilter, users]);

  useEffect(() => {
    if (userProfileFilter !== "ALL" && !userProfileOptions.includes(userProfileFilter)) {
      setUserProfileFilter("ALL");
    }
  }, [userProfileFilter, userProfileOptions]);

  useEffect(() => {
    if (reportCategoryFilter !== "ALL" && !reportCategoryOptions.some((option) => option.key === reportCategoryFilter)) {
      setReportCategoryFilter("ALL");
    }
  }, [reportCategoryFilter, reportCategoryOptions]);

  async function uploadHomeCardPreview(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/home-cards/upload-preview", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || "Falha ao enviar imagem.");
    }

    return payload;
  }

  function reportNamesForUser(user) {
    if (user.role === "ADMIN") {
      return [];
    }
    return activeReports.filter((report) => user.reportIds.includes(report.id)).map((report) => report.name);
  }

  function availableReportAssignmentFields() {
    return (reportForm.filterableFields || [])
      .filter((field) => field.tableName && field.columnName)
      .map((field) => ({
        key: `${field.tableName}::${field.columnName}`,
        tableName: field.tableName,
        columnName: field.columnName
      }));
  }

  function getSectionCount(sectionId) {
    if (sectionId === "home") {
      return homeCards.length;
    }
    if (sectionId === "categories") {
      return categories.length;
    }
    if (sectionId === "reports") {
      return reports.length;
    }
    return users.length;
  }

  function handleCreateForSection(sectionId) {
    if (sectionId === "home") {
      openNewHomeCardModal();
      return;
    }
    if (sectionId === "categories") {
      openNewCategoryModal();
      return;
    }
    if (sectionId === "reports") {
      openNewReportModal();
      return;
    }
    openNewUserModal();
  }

  function availableFieldOptions(rule) {
    const selectedReportIds = (rule.reportId ? [Number(rule.reportId)] : userForm.reportIds).filter((reportId) =>
      activeReportIds.has(reportId)
    );
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

  function closeHomeCardModal() {
    setHomeCardModalOpen(false);
    setEditingHomeCardId(null);
    setHomeCardForm(emptyHomeCard);
    setHomeCardUploadError("");
    setHomeCardUploading(false);
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

  function openNewHomeCardModal() {
    setError("");
    setNotice("");
    setEditingHomeCardId(null);
    setHomeCardForm(emptyHomeCard);
    setHomeCardUploadError("");
    setHomeCardModalOpen(true);
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
      let savedReport;

      if (editingReportId) {
        const response = await apiJson(`/reports/${editingReportId}`, {
          token,
          method: "PUT",
          data: payload
        });
        savedReport = response.report;
      } else {
        const response = await apiJson("/reports", {
          token,
          method: "POST",
          data: payload
        });
        savedReport = response.report;
      }

      await syncReportAssignments(savedReport.id, reportForm.userAssignments || [], payload.filterableFields || []);
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

  async function handleSaveHomeCard(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      const payload = {
        title: homeCardForm.title.trim(),
        description: homeCardForm.description.trim(),
        imageUrl: homeCardForm.imageUrl.trim(),
        actionLabel: homeCardForm.actionLabel.trim(),
        actionUrl: homeCardForm.actionUrl.trim(),
        sortOrder: Number(homeCardForm.sortOrder) || 0,
        userIds: homeCardForm.userIds,
        active: homeCardForm.active
      };

      if (editingHomeCardId) {
        await apiJson(`/home-cards/${editingHomeCardId}`, {
          token,
          method: "PUT",
          data: payload
        });
      } else {
        await apiJson("/home-cards", {
          token,
          method: "POST",
          data: payload
        });
      }

      await loadData();
      closeHomeCardModal();
      setNotice("Card inicial salvo com sucesso.");
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
      setNotice("Usuário salvo com sucesso.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function toggleHomeCardActive(card) {
    setError("");
    setNotice("");

    const actionLabel = card.active ? "inativar" : "ativar";
    if (!window.confirm(`Confirma ${actionLabel} o card "${card.title}"?`)) {
      return;
    }

    try {
      await apiJson(`/home-cards/${card.id}`, {
        token,
        method: "PUT",
        data: {
          title: card.title,
          description: card.description || "",
          imageUrl: card.imageUrl || "",
          actionLabel: card.actionLabel || "",
          actionUrl: card.actionUrl || "",
          sortOrder: Number(card.sortOrder) || 0,
          userIds: card.userIds || [],
          active: !card.active
        }
      });
      await loadData();
      setNotice(`Card ${!card.active ? "ativado" : "inativado"} com sucesso.`);
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

  function toggleUserReportGroup(reportIds, enabled) {
    setUserForm((current) => {
      const targetIds = reportIds.map(Number);
      const nextReportIds = enabled
        ? Array.from(new Set([...current.reportIds, ...targetIds]))
        : current.reportIds.filter((id) => !targetIds.includes(id));

      const nextRules = current.filterRules.map((rule) => {
        if (!rule.reportId) {
          const fields = nextReportIds.flatMap((id) => reportFieldMap[id] || []);
          const stillValid = fields.some(
            (field) => field.tableName === rule.tableName && field.columnName === rule.columnName
          );
          return stillValid ? rule : { ...rule, tableName: "", columnName: "" };
        }

        return nextReportIds.includes(rule.reportId) ? rule : { ...rule, reportId: null, tableName: "", columnName: "" };
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
    const nextReportIds = (user.reportIds || []).filter((reportId) => activeReportIds.has(reportId));
    const nextFilterRules = (user.filterRules || [])
      .filter((rule) => rule.reportId == null || activeReportIds.has(rule.reportId))
      .map((rule) => ({
        _key: crypto.randomUUID(),
        reportId: rule.reportId ?? null,
        tableName: rule.tableName,
        columnName: rule.columnName,
        value: rule.value
      }));

    setEditingUserId(user.id);
    setUserForm({
      username: user.username,
      displayName: user.displayName,
      profileLabel: user.profileLabel || "",
      password: "",
      role: user.role,
      active: user.active,
      reportIds: nextReportIds,
      filterRules: nextFilterRules
    });
    setUserModalOpen(true);
  }

  function startEditingHomeCard(card) {
    setError("");
    setNotice("");
    setEditingHomeCardId(card.id);
    setHomeCardUploadError("");
    setHomeCardForm({
      title: card.title,
      description: card.description || "",
      imageUrl: card.imageUrl || "",
      actionLabel: card.actionLabel || "",
      actionUrl: card.actionUrl || "",
      sortOrder: card.sortOrder ?? 0,
      userIds: card.userIds || [],
      active: card.active
    });
    setHomeCardModalOpen(true);
  }

  function startEditingReport(report) {
    setError("");
    setNotice("");
    const reportAssignments = users
      .filter(
        (user) =>
          user.role !== "ADMIN" &&
          (user.reportIds.includes(report.id) ||
            (user.filterRules || []).some((rule) => rule.reportId === report.id))
      )
      .map((user) => ({
        _key: crypto.randomUUID(),
        userId: String(user.id),
        filterRules: (user.filterRules || [])
          .filter((rule) => rule.reportId === report.id)
          .map((rule) => ({
            _key: crypto.randomUUID(),
            fieldKey: `${rule.tableName}::${rule.columnName}`,
            tableName: rule.tableName,
            columnName: rule.columnName,
            value: rule.value
          }))
      }));

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
      userAssignments: reportAssignments,
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

  function addReportAssignment() {
    setReportForm((current) => ({
      ...current,
      userAssignments: [...(current.userAssignments || []), blankAssignment()]
    }));
  }

  function removeReportAssignment(index) {
    setReportForm((current) => ({
      ...current,
      userAssignments: current.userAssignments.filter((_, assignmentIndex) => assignmentIndex !== index)
    }));
  }

  function updateReportAssignment(index, patch) {
    setReportForm((current) => ({
      ...current,
      userAssignments: current.userAssignments.map((assignment, assignmentIndex) => {
        if (assignmentIndex !== index) {
          return assignment;
        }

        return {
          ...assignment,
          ...patch
        };
      })
    }));
  }

  function toggleReportAssignmentForUser(userId, enabled) {
    setReportForm((current) => {
      const currentAssignments = current.userAssignments || [];
      const existingIndex = currentAssignments.findIndex((assignment) => Number(assignment.userId) === userId);

      if (enabled) {
        if (existingIndex >= 0) {
          return current;
        }

        return {
          ...current,
          userAssignments: [
            ...currentAssignments,
            {
              _key: crypto.randomUUID(),
              userId: String(userId),
              filterRules: []
            }
          ]
        };
      }

      if (existingIndex < 0) {
        return current;
      }

      return {
        ...current,
        userAssignments: currentAssignments.filter((_, assignmentIndex) => assignmentIndex !== existingIndex)
      };
    });
  }

  function toggleReportAssignmentGroup(groupUsers, enabled) {
    setReportForm((current) => {
      const currentAssignments = current.userAssignments || [];
      const groupUserIds = groupUsers.map((user) => user.id);

      if (enabled) {
        const existingIds = new Set(currentAssignments.map((assignment) => Number(assignment.userId)));
        const additions = groupUserIds
          .filter((userId) => !existingIds.has(userId))
          .map((userId) => ({
            _key: crypto.randomUUID(),
            userId: String(userId),
            filterRules: []
          }));

        return {
          ...current,
          userAssignments: [...currentAssignments, ...additions]
        };
      }

      return {
        ...current,
        userAssignments: currentAssignments.filter(
          (assignment) => !groupUserIds.includes(Number(assignment.userId))
        )
      };
    });
  }

  function toggleHomeCardUserGroup(groupUsers, enabled) {
    setHomeCardForm((current) => {
      const groupUserIds = groupUsers.map((user) => user.id);
      return {
        ...current,
        userIds: enabled
          ? Array.from(new Set([...current.userIds, ...groupUserIds]))
          : current.userIds.filter((userId) => !groupUserIds.includes(userId))
      };
    });
  }

  function addAssignmentRule(assignmentIndex) {
    setReportForm((current) => ({
      ...current,
      userAssignments: current.userAssignments.map((assignment, index) =>
        index === assignmentIndex
          ? {
              ...assignment,
              filterRules: [...assignment.filterRules, blankAssignmentRule()]
            }
          : assignment
      )
    }));
  }

  function removeAssignmentRule(assignmentIndex, ruleIndex) {
    setReportForm((current) => ({
      ...current,
      userAssignments: current.userAssignments.map((assignment, index) =>
        index === assignmentIndex
          ? {
              ...assignment,
              filterRules: assignment.filterRules.filter((_, currentRuleIndex) => currentRuleIndex !== ruleIndex)
            }
          : assignment
      )
    }));
  }

  function updateAssignmentRule(assignmentIndex, ruleIndex, patch) {
    setReportForm((current) => ({
      ...current,
      userAssignments: current.userAssignments.map((assignment, index) => {
        if (index !== assignmentIndex) {
          return assignment;
        }

        return {
          ...assignment,
          filterRules: assignment.filterRules.map((rule, currentRuleIndex) => {
            if (currentRuleIndex !== ruleIndex) {
              return rule;
            }

            const nextRule = { ...rule, ...patch };
            if (Object.prototype.hasOwnProperty.call(patch, "fieldKey")) {
              const selectedField = (current.filterableFields || [])
                .filter((field) => field.tableName && field.columnName)
                .map((field) => ({
                  key: `${field.tableName}::${field.columnName}`,
                  tableName: field.tableName,
                  columnName: field.columnName
                }))
                .find((field) => field.key === patch.fieldKey);
              nextRule.tableName = selectedField?.tableName || "";
              nextRule.columnName = selectedField?.columnName || "";
            }
            return nextRule;
          })
        };
      })
    }));
  }

  function normalizeReportAssignments(assignments, filterableFields = []) {
    const allowedFieldKeys = new Set(
      filterableFields.map((field) => `${field.tableName.trim()}::${field.columnName.trim()}`)
    );
    const mergedAssignments = new Map();

    assignments.forEach((assignment) => {
      const userId = Number(assignment.userId);
      if (!userId) {
        return;
      }

      const normalizedRules = (assignment.filterRules || [])
        .filter((rule) => {
          if (!rule.tableName || !rule.columnName || !rule.value) {
            return false;
          }

          return allowedFieldKeys.has(`${rule.tableName.trim()}::${rule.columnName.trim()}`);
        })
        .map((rule) => ({
          reportId: null,
          tableName: rule.tableName.trim(),
          columnName: rule.columnName.trim(),
          value: rule.value.trim()
        }));

      mergedAssignments.set(userId, {
        userId,
        filterRules: normalizedRules
      });
    });

    return Array.from(mergedAssignments.values());
  }

  async function syncReportAssignments(reportId, assignments, filterableFields) {
    const normalizedAssignments = normalizeReportAssignments(assignments, filterableFields);
    const assignmentMap = new Map(normalizedAssignments.map((assignment) => [assignment.userId, assignment]));
    const impactedUsers = users.filter(
      (user) =>
        assignmentMap.has(user.id) ||
        user.reportIds.includes(reportId) ||
        (user.filterRules || []).some((rule) => rule.reportId === reportId)
    );

    await Promise.all(
      impactedUsers.map((user) => {
        const assignment = assignmentMap.get(user.id);
        const nextReportIds = assignment
          ? Array.from(new Set([...user.reportIds, reportId]))
          : user.reportIds.filter((currentReportId) => currentReportId !== reportId);

        const otherRules = (user.filterRules || []).filter((rule) => rule.reportId !== reportId);
        const nextFilterRules = assignment
          ? [
              ...otherRules,
              ...assignment.filterRules.map((rule) => ({
                reportId,
                tableName: rule.tableName,
                columnName: rule.columnName,
                value: rule.value
              }))
            ]
          : otherRules;

        return apiJson(`/users/${user.id}`, {
          token,
          method: "PUT",
          data: buildUserPayload(
            {
              username: user.username,
              displayName: user.displayName,
              profileLabel: user.profileLabel || "",
              password: "",
              role: user.role,
              active: user.active,
              reportIds: nextReportIds,
              filterRules: nextFilterRules
            },
            {
              extraAllowedReportIds: [reportId]
            }
          )
        });
      })
    );
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

  function buildUserPayload(form, options = {}) {
    const extraAllowedReportIds = new Set((options.extraAllowedReportIds || []).map(Number));
    const isAllowedReportId = (reportId) => activeReportIds.has(reportId) || extraAllowedReportIds.has(reportId);

    if (form.role === "ADMIN") {
      return {
        ...form,
        reportIds: [],
        filterRules: []
      };
    }

    return {
      ...form,
      reportIds: form.reportIds.filter((reportId) => isAllowedReportId(reportId)),
      filterRules: form.filterRules
        .filter(
          (rule) =>
            rule.tableName &&
            rule.columnName &&
            rule.value &&
            (rule.reportId == null || isAllowedReportId(Number(rule.reportId)))
        )
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
    if (!window.confirm(`Confirma ${actionLabel} o usuário "${user.displayName}"?`)) {
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
      setNotice(`Usuário ${!user.active ? "ativado" : "inativado"} com sucesso.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteHomeCard() {
    if (!editingHomeCardId) {
      return;
    }

    if (!window.confirm(`Confirma excluir o card "${homeCardForm.title}"?`)) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await apiJson(`/home-cards/${editingHomeCardId}`, {
        token,
        method: "DELETE"
      });
      await loadData();
      closeHomeCardModal();
      setNotice("Card excluído com sucesso.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteReport() {
    if (!editingReportId) {
      return;
    }

    if (!window.confirm(`Confirma excluir o painel "${reportForm.name}"?`)) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await apiJson(`/reports/${editingReportId}`, {
        token,
        method: "DELETE"
      });
      await loadData();
      closeReportModal();
      setNotice("Painel excluído com sucesso.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteUser() {
    if (!editingUserId) {
      return;
    }

    if (!window.confirm(`Confirma excluir o usuário "${userForm.displayName}"?`)) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await apiJson(`/users/${editingUserId}`, {
        token,
        method: "DELETE"
      });
      await loadData();
      closeUserModal();
      setNotice("Usuário excluído com sucesso.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-card admin-toolbar-card admin-toolbar-card-compact">
        <div className="header-line">
          <div className="admin-toolbar-copy">
            <div className="eyebrow">Administração</div>
            <h1>Painéis, usuários e categorias</h1>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {notice ? <p className="success-text">{notice}</p> : null}
      </section>

      <section className="page-card admin-shell-card">
        <div className="admin-shell-layout">
          <aside className="admin-side-nav">
            <div className="sidebar-section-title">Gerenciar</div>
            <div className="admin-section-nav">
              {adminSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`admin-section-link ${activeSection === section.id ? "active" : ""}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span>{section.label}</span>
                  <span className="status-dot is-muted">{getSectionCount(section.id)}</span>
                </button>
              ))}
            </div>

            <div className="admin-side-create">
              <div className="muted small">Ação rápida</div>
              <button
                type="button"
                className="primary-btn"
                onClick={() => handleCreateForSection(activeSection)}
              >
                Novo {adminSections.find((section) => section.id === activeSection)?.singular}
              </button>
            </div>
          </aside>

          <div className="admin-section-panel">
            {activeSection === "home" ? (
              <>
                <div className="header-line">
                  <div>
                    <h2>Home inicial</h2>
                    <p className="muted small">Cards exibidos na página inicial dos usuários.</p>
                  </div>
                  <span className="muted small">{homeCards.length} card(s)</span>
                </div>
                {!homeCards.length ? (
                  <p className="muted">Nenhum card cadastrado.</p>
                ) : (
                  <div className="admin-row-list">
                    {homeCards.map((card) => (
                      <article key={card.id} className="admin-row-card admin-row-card-media">
                        <div className="admin-row-media">
                          {card.imageUrl ? <img src={card.imageUrl} alt={card.title} /> : <div className="admin-row-media-placeholder">Sem preview</div>}
                        </div>
                        <div className="admin-row-main">
                          <div className="admin-row-title">
                            <strong>{card.title}</strong>
                            <span className={`status-dot ${card.active ? "is-success" : "is-muted"}`}>
                              {card.active ? "Ativo" : "Inativo"}
                            </span>
                            <span className="muted small">Ordem {card.sortOrder}</span>
                          </div>
                          <div className="admin-row-meta">
                            {card.description ? (
                              <span className="tag-chip tag-chip-wide">{shortenText(card.description, 96)}</span>
                            ) : null}
                            <span className="tag-chip tag-chip-muted">
                              {(card.users || []).length} usuário(s)
                            </span>
                            {card.actionUrl ? (
                              <span className="tag-chip tag-chip-accent" title={card.actionUrl}>
                                {summarizeLink(card.actionUrl)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => toggleHomeCardActive(card)}
                            aria-label={`${card.active ? "Inativar" : "Ativar"} card ${card.title}`}
                          >
                            <PowerIcon />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => startEditingHomeCard(card)}
                            aria-label={`Editar card ${card.title}`}
                          >
                            <PencilIcon />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {activeSection === "categories" ? (
              <>
                <div className="header-line">
                  <div>
                    <h2>Categorias</h2>
                    <p className="muted small">Agrupe os painéis por tema e cor.</p>
                  </div>
                  <span className="muted small">{categories.length} categoria(s)</span>
                </div>
                {!categories.length ? (
                  <p className="muted">Nenhuma categoria cadastrada.</p>
                ) : (
                  <div className="admin-row-list">
                    {categories.map((category) => (
                      <article key={category.id} className="admin-row-card">
                        <div className="admin-row-main">
                          <div className="admin-row-title">
                            <span className="color-swatch" style={{ background: category.color }} />
                            <strong className="category-title-inline" style={{ color: category.color }}>
                              {category.name}
                            </strong>
                            <span className="muted small">Ordem {category.sortOrder}</span>
                          </div>
                          <div className="admin-row-meta">
                            <span className="tag-chip tag-chip-muted">
                              {category.reports?.length || 0} painel(is)
                            </span>
                            {category.reports?.slice(0, 8).map((report) => (
                              <span key={`${category.id}-${report.id}`} className="tag-chip">
                                {report.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => startEditingCategory(category)}
                            aria-label={`Editar categoria ${category.name}`}
                          >
                            <FolderIcon />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {activeSection === "reports" ? (
              <>
                <div className="header-line">
                  <div>
                    <h2>Painéis</h2>
                    <p className="muted small">Agrupados por categoria para localizar e editar rapidamente.</p>
                  </div>
                  <div className="header-inline-tools">
                    <label className="inline-filter">
                      <span className="muted small">Categoria</span>
                      <select value={reportCategoryFilter} onChange={(event) => setReportCategoryFilter(event.target.value)}>
                        <option value="ALL">Todas</option>
                        {reportCategoryOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="muted small">{filteredReportsCount} painel(is)</span>
                  </div>
                </div>
                {!filteredReportsCount ? (
                  <p className="muted">Nenhum painel cadastrado.</p>
                ) : (
                  <div className="admin-row-list">
                    {filteredReportsGroupedByCategory.map((group) => (
                      <section key={group.key} className="admin-group-card">
                        <div className="admin-group-header">
                          <div className="admin-row-title">
                            {group.color ? <span className="color-swatch" style={{ background: group.color }} /> : null}
                            <strong className="category-title-inline" style={group.color ? { color: group.color } : undefined}>
                              {group.label}
                            </strong>
                          </div>
                          <span className="tag-chip tag-chip-muted">{group.items.length} painel(is)</span>
                        </div>
                        <div className="admin-row-list">
                          {group.items.map((report) => {
                            const allowedUsers = reportUsersMap[report.id] || [];
                            return (
                              <article key={report.id} className="admin-row-card">
                                <div className="admin-row-main">
                                  <div className="admin-row-title">
                                    <strong>{report.name}</strong>
                                  </div>
                                  <div className="admin-row-meta">
                                    <span className={`status-dot ${report.active ? "is-success" : "is-muted"}`}>
                                      {report.active ? "Ativo" : "Inativo"}
                                    </span>
                                    <span className="tag-chip tag-chip-muted">
                                      {allowedUsers.length} usuário(s) com acesso
                                    </span>
                                    <span className="tag-chip tag-chip-muted">
                                      {(report.filterableFields || []).length} campo(s) filtráveis
                                    </span>
                                  </div>
                                </div>
                                <div className="admin-row-actions">
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
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {activeSection === "users" ? (
              <>
                <div className="header-line">
                  <div>
                    <h2>Usuários</h2>
                    <p className="muted small">Visualização densa para acompanhar todos os acessos.</p>
                  </div>
                  <div className="header-inline-tools">
                    <label className="inline-filter">
                      <span className="muted small">Perfil</span>
                      <select value={userProfileFilter} onChange={(event) => setUserProfileFilter(event.target.value)}>
                        <option value="ALL">Todos</option>
                        {userProfileOptions.map((profileLabel) => (
                          <option key={profileLabel} value={profileLabel}>
                            {profileLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="muted small">{filteredUsersForAdminSection.length} usuário(s)</span>
                  </div>
                </div>
                {!filteredUsersForAdminSection.length ? (
                  <p className="muted">Nenhum usuário cadastrado.</p>
                ) : (
                  <div className="admin-row-list">
                    {filteredUsersForAdminSection.map((user) => {
                      const availableReports = reportNamesForUser(user);
                      return (
                        <article key={user.id} className="admin-row-card">
                          <div className="admin-row-main">
                            <div className="admin-row-title">
                              <strong>{user.displayName}</strong>
                              {user.role !== "ADMIN" ? <span className="tag-chip tag-chip-muted">{getUserProfileLabel(user)}</span> : null}
                              <span className="muted small">
                                {user.username} · {user.role === "ADMIN" ? "Administrador" : "Usuário"}
                              </span>
                            </div>
                            <div className="admin-row-meta">
                              <span className={`status-dot ${user.active ? "is-success" : "is-muted"}`}>
                                {user.active ? "Ativo" : "Inativo"}
                              </span>
                              <span className="tag-chip tag-chip-muted">
                                {availableReports.length} painel(is) com acesso
                              </span>
                            </div>
                          </div>
                          <div className="admin-row-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => toggleUserActive(user)}
                              aria-label={`${user.active ? "Inativar" : "Ativar"} usuário ${user.displayName}`}
                            >
                              <PowerIcon />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => startEditingUser(user)}
                              aria-label={`Editar usuário ${user.displayName}`}
                            >
                              <PencilIcon />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </section>

      {homeCardModalOpen ? (
        <Modal title={editingHomeCardId ? "Editar card inicial" : "Novo card inicial"} onClose={closeHomeCardModal}>
          <form className="form-stack" onSubmit={handleSaveHomeCard}>
            <label>
              Título
              <input
                value={homeCardForm.title}
                onChange={(event) => setHomeCardForm({ ...homeCardForm, title: event.target.value })}
                required
              />
            </label>

            <label>
              Descrição
              <textarea
                className="text-area-input"
                value={homeCardForm.description}
                onChange={(event) => setHomeCardForm({ ...homeCardForm, description: event.target.value })}
                rows={4}
              />
            </label>

            <label>
              Imagem de preview
              <div className="home-card-upload-row">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }

                    try {
                      setHomeCardUploadError("");
                      setHomeCardUploading(true);
                      const payload = await uploadHomeCardPreview(file);
                      setHomeCardForm((current) => ({
                        ...current,
                        imageUrl: payload.imageUrl
                      }));
                    } catch (uploadError) {
                      setHomeCardUploadError(uploadError.message);
                    } finally {
                      setHomeCardUploading(false);
                      event.target.value = "";
                    }
                  }}
                />
                {homeCardUploading ? <span className="muted small">Enviando imagem...</span> : null}
              </div>
              <input
                value={homeCardForm.imageUrl}
                onChange={(event) => setHomeCardForm({ ...homeCardForm, imageUrl: event.target.value })}
                placeholder="/previews/arquivo.png"
              />
            </label>
            {homeCardUploadError ? <p className="error-text">{homeCardUploadError}</p> : null}
            {homeCardForm.imageUrl ? (
              <div className="home-card-preview-box">
                <img src={homeCardForm.imageUrl} alt="Preview do card" />
              </div>
            ) : null}

            <label>
              Texto do botão
              <input
                value={homeCardForm.actionLabel}
                onChange={(event) => setHomeCardForm({ ...homeCardForm, actionLabel: event.target.value })}
                placeholder="Saiba mais, Abrir..."
              />
            </label>

            <label>
              Link do botão
              <input
                value={homeCardForm.actionUrl}
                onChange={(event) => setHomeCardForm({ ...homeCardForm, actionUrl: event.target.value })}
                placeholder="/reports/1 ou https://..."
              />
            </label>

            <label>
              Ordem
              <input
                type="number"
                min="0"
                value={homeCardForm.sortOrder}
                onChange={(event) => setHomeCardForm({ ...homeCardForm, sortOrder: event.target.value })}
              />
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={homeCardForm.active}
                onChange={(event) => setHomeCardForm({ ...homeCardForm, active: event.target.checked })}
              />
              <span>Card ativo</span>
            </label>

            <fieldset>
              <legend>Usuários com acesso</legend>
              <div className="selection-group-grid">
                {usersGroupedByProfile.map((group) => {
                  const allSelected = group.items.every((user) => homeCardForm.userIds.includes(user.id));
                  return (
                    <section key={group.label} className="selection-group-card">
                      <label className="selection-group-header">
                        <span>{group.label}</span>
                        <span className="selection-group-check">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(event) => toggleHomeCardUserGroup(group.items, event.target.checked)}
                          />
                          <span>Marcar todos</span>
                        </span>
                      </label>
                      <div className="check-grid">
                        {group.items.map((user) => (
                          <label key={user.id} className="check-row">
                            <input
                              type="checkbox"
                              checked={homeCardForm.userIds.includes(user.id)}
                              onChange={(event) =>
                                setHomeCardForm((current) => ({
                                  ...current,
                                  userIds: event.target.checked
                                    ? Array.from(new Set([...current.userIds, user.id]))
                                    : current.userIds.filter((currentUserId) => currentUserId !== user.id)
                                }))
                              }
                            />
                            <span>{user.displayName}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </fieldset>

            <div className="inline-actions">
              <button type="submit" className="primary-btn">
                Salvar card
              </button>
              <button type="button" className="secondary-btn" onClick={closeHomeCardModal}>
                Cancelar
              </button>
              {editingHomeCardId ? (
                <button type="button" className="secondary-btn danger-btn" onClick={deleteHomeCard}>
                  Excluir
                </button>
              ) : null}
            </div>
          </form>
        </Modal>
      ) : null}

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
              Descrição
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
              Use o link de Arquivo &gt; Inserir relatório &gt; Site ou portal.
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
              <legend>Tabelas e colunas filtráveis</legend>
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
                  Adicionar campo filtrável
                </button>
              </div>
            </fieldset>

            <fieldset>
              <legend>Distribuir painel para usuários</legend>
              <div className="form-stack compact">
                <div className="selection-group-grid">
                  {usersGroupedByProfile.map((group) => {
                    const allSelected = group.items.every((user) =>
                      (reportForm.userAssignments || []).some((assignment) => Number(assignment.userId) === user.id)
                    );

                    return (
                      <section key={group.label} className="selection-group-card">
                        <label className="selection-group-header">
                          <span>{group.label}</span>
                          <span className="selection-group-check">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={(event) => toggleReportAssignmentGroup(group.items, event.target.checked)}
                            />
                            <span>Marcar todos</span>
                          </span>
                        </label>

                        <div className="assignment-user-grid">
                          {group.items.map((user) => {
                            const assignmentIndex = (reportForm.userAssignments || []).findIndex(
                              (assignment) => Number(assignment.userId) === user.id
                            );
                            const assignment = assignmentIndex >= 0 ? reportForm.userAssignments[assignmentIndex] : null;
                            const availableFields = availableReportAssignmentFields();

                            return (
                              <article
                                key={user.id}
                                className={`assignment-user-card ${assignment ? "is-selected" : ""}`}
                              >
                                <label className="check-row assignment-user-toggle">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(assignment)}
                                    onChange={(event) => toggleReportAssignmentForUser(user.id, event.target.checked)}
                                  />
                                  <span>{user.displayName}</span>
                                </label>

                                {assignment ? (
                                  <div className="form-stack compact">
                                    {assignment.filterRules.map((rule, ruleIndex) => (
                                      <div key={rule._key} className="assignment-rule-row">
                                        <select
                                          value={rule.fieldKey}
                                          onChange={(event) =>
                                            updateAssignmentRule(assignmentIndex, ruleIndex, {
                                              fieldKey: event.target.value
                                            })
                                          }
                                        >
                                          <option value="">
                                            {availableFields.length ? "Selecione o campo" : "Cadastre campos acima"}
                                          </option>
                                          {availableFields.map((field) => (
                                            <option key={field.key} value={field.key}>
                                              {field.tableName}.{field.columnName}
                                            </option>
                                          ))}
                                        </select>
                                        <input
                                          placeholder="Valor do filtro"
                                          value={rule.value}
                                          onChange={(event) =>
                                            updateAssignmentRule(assignmentIndex, ruleIndex, {
                                              value: event.target.value
                                            })
                                          }
                                        />
                                        <button
                                          type="button"
                                          className="secondary-btn"
                                          onClick={() => removeAssignmentRule(assignmentIndex, ruleIndex)}
                                        >
                                          Remover
                                        </button>
                                      </div>
                                    ))}

                                    <button
                                      type="button"
                                      className="secondary-btn"
                                      onClick={() => addAssignmentRule(assignmentIndex)}
                                    >
                                      Adicionar filtro
                                    </button>
                                  </div>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <p className="muted small">
                  Ao salvar, o painel já será vinculado aos usuários escolhidos com os filtros definidos aqui.
                </p>
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
              {editingReportId ? (
                <button type="button" className="secondary-btn danger-btn" onClick={deleteReport}>
                  Excluir
                </button>
              ) : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {userModalOpen ? (
        <Modal title={editingUserId ? "Editar usuário" : "Novo usuário"} onClose={closeUserModal}>
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
              Nome de exibição
              <input
                value={userForm.displayName}
                onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })}
                required
              />
            </label>

            <label>
              Perfil de negócio
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
              Permissão
              <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
                <option value="USER">Usuário</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={userForm.active}
                onChange={(event) => setUserForm({ ...userForm, active: event.target.checked })}
              />
              <span>Usuário ativo</span>
            </label>

            {userForm.role === "ADMIN" ? (
              <p className="muted small">Usuários administradores não recebem painéis vinculados.</p>
            ) : (
              <fieldset>
                <legend>Painéis liberados</legend>
                <div className="selection-group-grid">
                  {activeReportsGroupedByCategory.map((group) => {
                    const groupReportIds = group.items.map((report) => report.id);
                    const allSelected = groupReportIds.every((reportId) => userForm.reportIds.includes(reportId));

                    return (
                      <section key={group.key} className="selection-group-card">
                        <label className="selection-group-header">
                          <span style={group.color ? { color: group.color } : undefined}>{group.label}</span>
                          <span className="selection-group-check">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={(event) => toggleUserReportGroup(groupReportIds, event.target.checked)}
                            />
                            <span>Marcar todos</span>
                          </span>
                        </label>

                        <div className="check-grid">
                          {group.items.map((report) => (
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
                      </section>
                    );
                  })}
                </div>
              </fieldset>
            )}

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
                        <option value="">Todos os painéis selecionados</option>
                        {activeReports
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
                        <option value="">{tables.length ? "Selecione a tabela" : "Sem tabelas disponíveis"}</option>
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
                        <option value="">{columns.length ? "Selecione a coluna" : "Sem colunas disponíveis"}</option>
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
                  As tabelas e colunas disponíveis aqui são definidas no cadastro do painel.
                </p>
              </div>
            </fieldset>

            <div className="inline-actions">
              <button type="submit" className="primary-btn">
                Salvar usuário
              </button>
              <button type="button" className="secondary-btn" onClick={closeUserModal}>
                Cancelar
              </button>
              {editingUserId && authUser?.id !== editingUserId ? (
                <button type="button" className="secondary-btn danger-btn" onClick={deleteUser}>
                  Excluir
                </button>
              ) : null}
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
              Cor do título
              <div className="color-picker-row">
                <span className="color-swatch color-swatch-lg" style={{ background: categoryForm.color }} />
                <input
                  className="color-text-input"
                  value={categoryForm.color}
                  onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
                  placeholder="#ff7b2c"
                />
                <input
                  className="color-picker-input"
                  type="color"
                  value={categoryForm.color}
                  onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
                  aria-label="Selecionar cor da categoria"
                />
              </div>
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
