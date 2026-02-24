"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  type AdminUser,
  getUser,
  isAuthenticated,
  login as authLogin,
  logout as authLogout,
} from "@/lib/auth";

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isAuthenticated()) {
      setUser(getUser());
    } else if (pathname !== "/login") {
      router.replace("/login");
    }
    setLoading(false);
  }, [pathname, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const u = await authLogin(email, password);
      setUser(u);
      router.replace("/");
    },
    [router]
  );

  const logout = useCallback(() => {
    setUser(null);
    authLogout();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
