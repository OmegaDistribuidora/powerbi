import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import logo from "../assets/logo.png";

export default function LoginPage() {
  const { login, isAuthenticated, user, ssoError } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Omega@123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to={user?.role === "ADMIN" ? "/admin" : "/"} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      setLoading(true);
      const payload = await login(username, password);
      navigate(payload?.user?.role === "ADMIN" ? "/admin" : "/", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <img src={logo} alt="Omega BI Hub" className="login-brand-logo" />
          <h1>Omega BI Hub</h1>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            Usuario
            <input value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}
          {!error && ssoError ? <p className="error-text">{ssoError}</p> : null}

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
