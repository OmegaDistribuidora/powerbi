import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiJson, setUnauthorizedHandler } from "../services/api";

const STORAGE_KEY = "powerbi-auth";
const AuthContext = createContext(null);

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { token: null, user: null };
  } catch (error) {
    return { token: null, user: null };
  }
}

function readSsoTokenFromHash() {
  try {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    return params.get("sso");
  } catch (error) {
    return null;
  }
}

function clearSsoHash() {
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}`);
}

export function AuthProvider({ children }) {
  const initial = readStorage();
  const initialSsoToken = readSsoTokenFromHash();
  const [token, setToken] = useState(initial.token || null);
  const [user, setUser] = useState(initial.user || null);
  const [loading, setLoading] = useState(Boolean(initialSsoToken || initial.token));
  const [ssoError, setSsoError] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
  }, [token, user]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      setLoading(false);
      setSsoError("");
    });

    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const ssoToken = readSsoTokenFromHash();
    if (token || !ssoToken) {
      return undefined;
    }

    let alive = true;
    setLoading(true);
    setSsoError("");
    apiJson("/auth/sso/exchange", {
      method: "POST",
      data: { token: ssoToken }
    })
      .then((payload) => {
        if (!alive) return;
        setToken(payload.token);
        setUser(payload.user);
      })
      .catch((error) => {
        if (!alive) return;
        setToken(null);
        setUser(null);
        setSsoError(error.message || "Falha ao validar login vindo do Ecossistema.");
      })
      .finally(() => {
        clearSsoHash();
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const pendingSsoToken = readSsoTokenFromHash();
    if (!token) {
      if (pendingSsoToken) {
        return undefined;
      }
      setLoading(false);
      return undefined;
    }

    let alive = true;
    setLoading(true);
    apiJson("/auth/me", { token })
      .then((payload) => {
        if (alive) {
          setUser(payload.user);
        }
      })
      .catch(() => {
        if (alive) {
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      ssoError,
      isAuthenticated: Boolean(token && user),
      async login(username, password) {
        setSsoError("");
        const payload = await apiJson("/auth/login", {
          method: "POST",
          data: { username, password }
        });
        setToken(payload.token);
        setUser(payload.user);
        return payload;
      },
      logout() {
        setToken(null);
        setUser(null);
        setSsoError("");
      }
    }),
    [token, user, loading, ssoError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return context;
}
