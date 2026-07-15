import { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

const STORAGE_KEY = 'url_shortener_auth';

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadStored); // { token, user } | null

  const persist = useCallback((value) => {
    setAuth(value);
    if (value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const login = useCallback(
    async (email, password) => {
      const result = await api.login(email, password);
      persist(result);
      return result;
    },
    [persist]
  );

  const loginWithGoogle = useCallback(
    async (idToken) => {
      const result = await api.loginWithGoogle(idToken);
      persist(result);
      return result;
    },
    [persist]
  );

  const register = useCallback(
    async (email, password) => {
      const result = await api.register(email, password);
      persist(result);
      return result;
    },
    [persist]
  );

  const logout = useCallback(() => persist(null), [persist]);

  return (
    <AuthContext.Provider
      value={{ user: auth?.user ?? null, token: auth?.token ?? null, login, loginWithGoogle, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
