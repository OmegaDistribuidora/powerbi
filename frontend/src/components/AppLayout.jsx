import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { apiJson } from "../services/api";
import logo from "../assets/logo.png";

function PasswordModal({ onClose, onSubmit, saving, error, success, isAdmin, users, currentUserId }) {
  const [form, setForm] = useState({
    targetUserId: currentUserId || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      targetUserId: currentUserId || ""
    }));
  }, [currentUserId]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit(form, () =>
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      })
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Trocar senha"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">Conta</div>
            <h2>Trocar senha</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            x
          </button>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          {isAdmin ? (
            <label>
              Usuário
              <select
                value={form.targetUserId}
                onChange={(event) => updateField("targetUserId", Number(event.target.value))}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} ({user.username})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Senha atual
              <input
                type="password"
                value={form.currentPassword}
                onChange={(event) => updateField("currentPassword", event.target.value)}
                required
              />
            </label>
          )}

          <label>
            Nova senha
            <input
              type="password"
              value={form.newPassword}
              onChange={(event) => updateField("newPassword", event.target.value)}
              required
              minLength={6}
            />
          </label>

          <label>
            Confirmar nova senha
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
              required
              minLength={6}
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}

          <div className="modal-actions">
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? "Salvando..." : "Salvar senha"}
            </button>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function AppLayout() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [reportsError, setReportsError] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState({});

  useEffect(() => {
    if (!token) {
      setReports([]);
      setAdminUsers([]);
      setReportsError("");
      return;
    }

    let active = true;
    apiJson("/dashboard", { token })
      .then((payload) => {
        if (!active) {
          return;
        }
        setReports(payload.reports || []);
        setCategories(payload.categories || []);
        setReportsError("");
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }
        setReports([]);
        setCategories([]);
        setReportsError(requestError.message);
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") {
      setAdminUsers([]);
      return;
    }

    let active = true;
    apiJson("/users", { token })
      .then((payload) => {
        if (!active) {
          return;
        }
        setAdminUsers((payload.users || []).sort((a, b) => a.displayName.localeCompare(b.displayName)));
      })
      .catch(() => {
        if (active) {
          setAdminUsers([]);
        }
      });

    return () => {
      active = false;
    };
  }, [token, user?.role]);

  const userReports = useMemo(() => {
    if (user?.role === "ADMIN") {
      return [];
    }

    return reports;
  }, [reports, user?.role]);

  const groupedUserReports = useMemo(() => {
    if (!userReports.length) {
      return [];
    }

    const grouped = new Map();
    categories.forEach((category) => grouped.set(category.id, { ...category, reports: [] }));

    userReports.forEach((report) => {
      if (report.category?.id && grouped.has(report.category.id)) {
        grouped.get(report.category.id).reports.push(report);
        return;
      }

      if (!grouped.has("uncategorized")) {
        grouped.set("uncategorized", {
          id: "uncategorized",
          name: "Sem categoria",
          color: "#9cb0d1",
          reports: []
        });
      }
      grouped.get("uncategorized").reports.push(report);
    });

    return Array.from(grouped.values()).filter((group) => group.reports.length);
  }, [categories, userReports]);

  function toggleCategory(categoryId) {
    setCollapsedCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId]
    }));
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  async function handleChangePassword(form, resetForm) {
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordSuccess("");

    try {
      const payload = await apiJson("/auth/change-password", {
        method: "POST",
        token,
        data: {
          ...form,
          targetUserId: form.targetUserId ? Number(form.targetUserId) : undefined
        }
      });
      setPasswordSuccess(payload.message || "Senha alterada com sucesso.");
      resetForm();
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setPasswordSaving(false);
    }
  }

  function openPasswordModal() {
    setPasswordError("");
    setPasswordSuccess("");
    setPasswordModalOpen(true);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <NavLink to="/" className="brand brand-link">
            <span className="brand-mark">
              <img src={logo} alt="Omega BI Hub" className="brand-logo" />
              <span>Omega BI Hub</span>
            </span>
          </NavLink>
        </div>

        <nav className="nav-stack">
          {groupedUserReports.map((group) => (
            <div key={group.id} className="sidebar-category-card">
              <button
                type="button"
                className="sidebar-category-toggle"
                onClick={() => toggleCategory(group.id)}
                aria-expanded={!collapsedCategories[group.id]}
              >
                <span className="sidebar-section-title" style={{ color: group.color }}>
                  {group.name}
                </span>
                <span className="sidebar-category-arrow">{collapsedCategories[group.id] ? "+" : "-"}</span>
              </button>
              {!collapsedCategories[group.id] ? (
                <div className="sidebar-report-list">
                  {group.reports.map((report) => (
                    <NavLink key={report.id} to={`/reports/${report.id}`} className="nav-link nav-link-compact">
                      {report.name}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {reportsError && user?.role !== "ADMIN" ? <div className="muted small">{reportsError}</div> : null}
          {user?.role === "ADMIN" ? (
            <>
              <NavLink to="/admin" className="nav-link">
                Administração
              </NavLink>
              <NavLink to="/mapping" className="nav-link">
                Mapeamento de painéis
              </NavLink>
              <NavLink to="/audit" className="nav-link">
                Auditoria
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="sidebar-foot">
          <strong>{user?.displayName || user?.username}</strong>
          <button type="button" className="secondary-btn ghost-btn" onClick={openPasswordModal}>
            Trocar senha
          </button>
          <button type="button" className="primary-btn ghost-btn" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>

      {passwordModalOpen ? (
        <PasswordModal
          onClose={() => setPasswordModalOpen(false)}
          onSubmit={handleChangePassword}
          saving={passwordSaving}
          error={passwordError}
          success={passwordSuccess}
          isAdmin={user?.role === "ADMIN"}
          users={adminUsers}
          currentUserId={user?.id}
        />
      ) : null}
    </div>
  );
}
