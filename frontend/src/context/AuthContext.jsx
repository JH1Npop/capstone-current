import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL, api, clearStoredAuth, getApiErrorMessage } from '../api/core';

const AuthContext = createContext(null);

const normalizeRegisterErrors = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(
    Object.entries(data).map(([field, value]) => [
      field,
      Array.isArray(value) ? value.map(String).join(' ') : String(value),
    ]),
  );
};

const formatRegisterError = (error) => {
  const data = error?.response?.data;

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const preferredFields = [
      'username',
      'email',
      'phone',
      'password',
      'password_confirm',
      'first_name',
      'last_name',
      'address',
      'role',
      'non_field_errors',
      'error',
      'detail'
    ];

    for (const field of preferredFields) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) {
        continue;
      }

      const value = data[field];
      const message = Array.isArray(value) ? value[0] : value;
      if (!message) {
        continue;
      }

      if (field === 'error' || field === 'detail' || field === 'non_field_errors') {
        return String(message);
      }

      const label = field.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
      return `${label}: ${message}`;
    }
  }

  return getApiErrorMessage(error, 'Registration failed. Please try again.');
};

export const AuthProvider = ({ children }) => {
  // Rehydrate only for the current browser tab/session.
  const [user, setUser] = useState(() => {
    try {
      const storedToken = sessionStorage.getItem('afn_token');
      if (!storedToken) {
        return null;
      }

      const stored = sessionStorage.getItem('afn_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => sessionStorage.getItem('afn_token') || null);

  // True while the initial /users/me/ sync is running.
  // RoleRedirect reads this so it waits before attempting a redirect.
  const [loading, setLoading] = useState(() => !!sessionStorage.getItem('afn_token'));

  // Keep Axios default header in sync with token state
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Token ${token}`;
      api.defaults.headers.common['Authorization'] = `Token ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
      delete api.defaults.headers.common['Authorization'];

      // If the token is gone, the session is no longer valid.
      if (user) {
        sessionStorage.removeItem('afn_user');
        setUser(null);
      }
    }
  }, [token, user]);

  // Reconcile the stored user against the active token so stale localStorage
  // cannot leave the UI thinking one user is logged in while the backend sees another.
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const syncAuthenticatedUser = async () => {
      try {
        const response = await api.get('/users/me/');
        const resolvedUser = response.data;

        if (!isMounted) {
          return;
        }

        sessionStorage.setItem('afn_user', JSON.stringify(resolvedUser));
        setUser(resolvedUser);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const status = error?.response?.status ?? null;
        const isUnauthorized = status === 401 || status === 403;

        if (isUnauthorized) {
          clearStoredAuth();
          setToken(null);
          setUser(null);
        } else {
          // Preserve the locally cached session when the backend is temporarily unavailable.
          const storedUser = sessionStorage.getItem('afn_user');
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch {
              setUser((currentUser) => currentUser);
            }
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    syncAuthenticatedUser();

    return () => {
      isMounted = false;
    };
  }, [token]);

  /**
   * Authenticate against the Django backend.
   * Returns { success: true } or { success: false, message: string }
   */
  const login = useCallback(async (username, password) => {
    try {
      clearStoredAuth();
      setToken(null);
      setUser(null);

      const response = await api.post('/users/login/', { username, password }, { timeout: 15_000 });
      const { user: userData, token: authToken } = response.data;

      sessionStorage.setItem('afn_token', authToken);
      sessionStorage.setItem('afn_user', JSON.stringify(userData));

      setToken(authToken);
      setUser(userData);

      return { success: true, user: userData, token: authToken };
    } catch (err) {
      clearStoredAuth();
      setToken(null);
      setUser(null);

      const message =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Invalid username or password';
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(async () => {
    const authToken = token;

    // Best-effort server-side token invalidation
    if (authToken) {
      try {
        await axios.post(
          `${API_BASE_URL}/users/logout/`,
          {},
          {
            headers: {
              Authorization: `Token ${authToken}`
            }
          }
        );
      } catch {
        // Local logout should still work if the server cannot be reached.
      }
    }

    clearStoredAuth();
    setToken(null);
    setUser(null);
  }, [token]);

  const updateCurrentUser = useCallback((nextUser) => {
    setUser((currentUser) => {
      const resolvedUser = typeof nextUser === 'function'
        ? nextUser(currentUser)
        : { ...currentUser, ...nextUser };

      if (resolvedUser) {
        sessionStorage.setItem('afn_user', JSON.stringify(resolvedUser));
      } else {
        sessionStorage.removeItem('afn_user');
      }

      return resolvedUser;
    });
  }, []);

  /**
   * Register a new user account.
   * Returns { success: true } or { success: false, message: string }
   */
  const register = useCallback(async (userData) => {
    try {
      clearStoredAuth();
      setToken(null);
      setUser(null);

      const response = await axios.post(`${API_BASE_URL}/users/register/`, userData, { timeout: 15_000 });
      const { user: newUser, message } = response.data;

      return { success: true, user: newUser, message };
    } catch (err) {
      return {
        success: false,
        message: formatRegisterError(err),
        errors: normalizeRegisterErrors(err?.response?.data),
      };
    }
  }, []);

  const resendVerification = useCallback(async (email) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/users/resend_verification/`,
        { email },
        { timeout: 15_000 },
      );
      return { success: true, message: response.data?.message || 'Verification email requested.' };
    } catch (error) {
      return {
        success: false,
        message: getApiErrorMessage(error, 'Unable to resend the verification email. Please try again.'),
      };
    }
  }, []);

  const isAuthenticated = !!user && !!token;

  const contextValue = useMemo(() => ({
    user,
    token,
    isAuthenticated,
    loading,
    login,
    logout,
    register,
    resendVerification,
    updateCurrentUser
  }), [user, token, isAuthenticated, loading, login, logout, register, resendVerification, updateCurrentUser]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    // Fallback for cases where hook is called outside provider or during initialization
    return { user: null, token: null, isAuthenticated: false, loading: false, login: async () => {}, logout: () => {}, register: async () => {}, resendVerification: async () => {}, updateCurrentUser: () => {} };
  }
  return context;
};
