import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  portalLogin: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session-Kontext für Staff und Kundenportal.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.me();
      setUser({ ...res.user, role: res.user.role ?? "admin" });
    } catch {
      try {
        const res = await api.portalMe();
        setUser(res.user);
      } catch {
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (username: string, password: string, rememberMe = true) => {
    const res = await api.login(username, password, rememberMe);
    setUser({ ...res.user, role: res.user.role ?? "admin" });
  }, []);

  const portalLogin = useCallback(async (username: string, password: string, rememberMe = true) => {
    const res = await api.portalLogin(username, password, rememberMe);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (user?.role === "customer") await api.portalLogout();
      else await api.logout();
    } catch {
      await api.logout().catch(() => undefined);
    }
    setUser(null);
  }, [user?.role]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (user?.role === "customer") {
        await api.portalChangePassword(currentPassword, newPassword);
      } else {
        await api.changePassword(currentPassword, newPassword);
      }
    },
    [user?.role],
  );

  const value = useMemo(
    () => ({ user, loading, login, portalLogin, logout, changePassword, refresh }),
    [user, loading, login, portalLogin, logout, changePassword, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
