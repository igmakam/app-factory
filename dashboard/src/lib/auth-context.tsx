import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, User } from './api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getGuestTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('guest');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const guestToken = getGuestTokenFromUrl();

    if (guestToken) {
      // Guest access — store the token directly and validate via /me
      localStorage.setItem('token', guestToken);
      setToken(guestToken);
      api.auth.me()
        .then((u) => {
          setUser(u);
          // Remove ?guest= from URL without reload
          const url = new URL(window.location.href);
          url.searchParams.delete('guest');
          window.history.replaceState({}, '', url.pathname + url.search);
        })
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else if (token) {
      api.auth.me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    localStorage.setItem('token', res.access_token);
    setToken(res.access_token);
    setUser(res.user);
  };

  const register = async (email: string, password: string, fullName: string) => {
    const res = await api.auth.register(email, password, fullName);
    localStorage.setItem('token', res.access_token);
    setToken(res.access_token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
