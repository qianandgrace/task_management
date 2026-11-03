import { createContext, useState, useEffect, useCallback } from 'react';
import { setToken } from '../api/token';
import { login as apiLogin, register as apiRegister } from '../api/auth';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: we have no /me endpoint to validate token + recover user,
  // so we simply trust the stored token. If invalid, the first API call
  // will get 401 and clear it gracefully. User navigates straight to Tasks.
  useEffect(() => {
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    setToken(data.token);
    setCurrentUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (email, password, name) => {
    const data = await apiRegister(email, password, name);
    setToken(data.token);
    setCurrentUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
