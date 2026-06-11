import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiClient, type ModeratorDoc, setCsrfToken } from "@/lib/apiClient";

interface AuthContextValue {
  user: ModeratorDoc | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ModeratorDoc | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await apiClient.session.get();
      setCsrfToken(session.csrfToken);
      setUser(session.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Any API call hitting a 401 dispatches this; drop the session so
  // ProtectedRoute redirects to /login.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await apiClient.session.create({ email, password });
    setCsrfToken(session.csrfToken);
    setUser(session.user);
    setIsLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiClient.session.destroy();
    } finally {
      setUser(null);
      // Rails rotates the CSRF token on logout; fetch a fresh one so a
      // subsequent sign-in POST is accepted.
      try {
        const session = await apiClient.session.get();
        setCsrfToken(session.csrfToken);
      } catch {
        setCsrfToken(null);
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      signIn,
      signOut,
      refresh,
    }),
    [user, isLoading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
