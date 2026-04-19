import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await api.get<{ user: User }>('/me');
        setUser(response.data.user);
        localStorage.setItem('noxivo_admin_user', JSON.stringify(response.data.user));
      } catch (error) {
        localStorage.removeItem('noxivo_admin_user');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    const response = await api.post('/login', credentials);
    const userData = response.data.user;
    setUser(userData);
    localStorage.setItem('noxivo_admin_user', JSON.stringify(userData));
  };

  const logout = async () => {
    try {
      await api.post('/logout');
    } catch {
      // clear local auth state regardless of network response
    }

    setUser(null);
    localStorage.removeItem('noxivo_admin_user');
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
