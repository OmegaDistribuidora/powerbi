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

export function AuthProvider({ children }) {
  const initial = readStorage();
  const [token, setToken] = useState(initial.token || null);
  const [user, setUser] = useState(initial.user || null);
  const [loading, setLoading] = useState(Boolean(initial.token));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
  }, [token, user]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      setLoading(false);
    });

    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
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
      isAuthenticated: Boolean(token && user),
      async login(username, password) {
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
      }
    }),
    [token, user, loading]
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
