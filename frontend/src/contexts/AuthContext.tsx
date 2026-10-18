import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '../types';
import { apiClient } from '../api/apiClient';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUserCurrency: (currency: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    // Clear user-scoped assistant conversation and animation entries from sessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (
            key.startsWith('finsight_conversation_') ||
            key.startsWith('finsight_completed_') ||
            key.startsWith('finsight_interrupted_') ||
            key.startsWith('finsight_period_') ||
            key.startsWith('finsight_revealed_')
          )) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
      } catch (_err) {
        void _err;
      }
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('finsight_token');
    localStorage.removeItem('finsight_user');
    queryClient.clear();
    toast.success('Logged out successfully.');
  }, [queryClient]);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('finsight_token');
      const storedUser = localStorage.getItem('finsight_user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        
        // Optionally verify user token integrity against /auth/me
        try {
          const res = await apiClient.get('/auth/me');
          setUser({
            user_id: res.data.user_id,
            name: res.data.name,
            email: res.data.email,
            currency: res.data.currency,
          });
          localStorage.setItem('finsight_user', JSON.stringify({
            user_id: res.data.user_id,
            name: res.data.name,
            email: res.data.email,
            currency: res.data.currency,
          }));
        } catch {
          logout();
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, [logout]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { access_token, user_id, name, email: userEmail } = response.data;

      const profileRes = await apiClient.get('/auth/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const loggedUser: User = {
        user_id,
        name,
        email: userEmail,
        currency: profileRes.data.currency || 'INR',
      };

      setToken(access_token);
      setUser(loggedUser);

      localStorage.setItem('finsight_token', access_token);
      localStorage.setItem('finsight_user', JSON.stringify(loggedUser));
      
      toast.success(`Welcome back, ${name}!`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const errorMsg = err.response?.data?.detail || 'Invalid email or password.';
      toast.error(errorMsg);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/auth/register', {
        full_name: name,
        email,
        password,
      });
      const { access_token, user_id, name: registeredName, email: userEmail } = response.data;

      const loggedUser: User = {
        user_id,
        name: registeredName,
        email: userEmail,
        currency: 'INR', // Default preference
      };

      setToken(access_token);
      setUser(loggedUser);

      localStorage.setItem('finsight_token', access_token);
      localStorage.setItem('finsight_user', JSON.stringify(loggedUser));

      toast.success('Registration successful!');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const errorMsg = err.response?.data?.detail || 'Unable to connect to server. Please try again.';
      toast.error(errorMsg);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserCurrency = (currency: string) => {
    if (user) {
      const updated = { ...user, currency };
      setUser(updated);
      localStorage.setItem('finsight_user', JSON.stringify(updated));
    }
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
        updateUserCurrency,
      }}
    >
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
