import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiJson, setTokenRefreshHandler, setUnauthorizedHandler } from "../services/api";

const STORAGE_KEY = "powerbi-auth";
const SESSION_PING_INTERVAL_MS = 5 * 60 * 1000;
const AuthContext = createContext(null);

function parseTokenExpiration(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch (error) {
    return null;
  }
}

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
  const initialExpiry = parseTokenExpiration(initial.token);
  const hasInitialExpired = Boolean(initialExpiry && initialExpiry <= Date.now());
  const shouldPreferSso = Boolean(initialSsoToken);
  const [token, setToken] = useState(shouldPreferSso || hasInitialExpired ? null : initial.token || null);
  const [user, setUser] = useState(shouldPreferSso || hasInitialExpired ? null : initial.user || null);
  const [loading, setLoading] = useState(
    Boolean(initialSsoToken || (!shouldPreferSso && !hasInitialExpired && initial.token))
  );
  const [ssoError, setSsoError] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
  }, [token, user]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const expiresAt = parseTokenExpiration(token);
    if (!expiresAt) {
      return undefined;
    }

    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      setToken(null);
      setUser(null);
      setLoading(false);
      setSsoError("");
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToken(null);
      setUser(null);
      setLoading(false);
      setSsoError("");
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      setLoading(false);
      setSsoError("");
    });
    setTokenRefreshHandler((nextToken) => {
      setToken((currentToken) => (currentToken === nextToken ? currentToken : nextToken));
    });

    return () => {
      setUnauthorizedHandler(null);
      setTokenRefreshHandler(null);
    };
  }, []);

  useEffect(() => {
    const ssoToken = readSsoTokenFromHash();
    if (!ssoToken) {
      return undefined;
    }

    let alive = true;
    setToken(null);
    setUser(null);
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
  }, []);

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
      .catch((error) => {
        if (alive) {
          if (error?.status === 401) {
            setToken(null);
            setUser(null);
          }
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

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let cancelled = false;

    async function refreshSessionSilently() {
      if (document.visibilityState === "hidden") {
        return;
      }

      try {
        const payload = await apiJson("/auth/me", { token });
        if (!cancelled) {
          setUser(payload.user);
        }
      } catch (error) {
        if (!cancelled && error?.status === 401) {
          setToken(null);
          setUser(null);
        }
      }
    }

    const intervalId = window.setInterval(() => {
      refreshSessionSilently();
    }, SESSION_PING_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSessionSilently();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
