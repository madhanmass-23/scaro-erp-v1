import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../../services/api/authApi';
import { storageApi } from '../../services/api/storageApi';
import { authSession } from '../../lib/authSession';
import { ApiError } from '../../lib/api';
import type { LoginRequest, ChangePasswordRequest } from '../../types/api';

export interface UserProfile {
  id: string;
  email?: string;
  full_name: string;
  display_name: string;
  avatar_url?: string;
  phone?: string;
  designation?: string;
  department_id?: string;
  department_name?: string;
  employment_status?: string;
  is_active: boolean;
  linkedin?: string;
  github?: string;
  joining_date?: string;
}

export interface AuthUser {
  id: string;
  email?: string;
}

export interface AuthState {
  session: { accessToken: string } | null;
  user: AuthUser | null;
  profile: UserProfile | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  signIn: (credentials: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword?: (payload: ChangePasswordRequest) => Promise<void>;
}

const defaultAuthContext: AuthState = {
  session: null,
  user: null,
  profile: null,
  role: null,
  loading: true,
  error: null,
  refreshProfile: async () => {},
  signIn: async () => {},
  signOut: async () => {},
};

const AuthContext = createContext<AuthState>(defaultAuthContext);

interface RawUserData {
  id: string;
  email?: string;
  full_name?: string;
  display_name?: string;
  avatar_url?: string | null;
  phone?: string | null;
  designation?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  employment_status?: string | null;
  is_active?: boolean;
  linkedin?: string | null;
  github?: string | null;
  joining_date?: string | null;
  role?: string | null;
}

function formatAuthData(userData: RawUserData | null | undefined, accessToken?: string | null) {
  if (!userData) {
    return { user: null, profile: null, role: null, session: null };
  }

  const user: AuthUser = {
    id: userData.id,
    email: userData.email,
  };

  const resolvedAvatar = storageApi.resolveUrl(userData.avatar_url);

  const profile: UserProfile = {
    id: userData.id,
    email: userData.email,
    full_name: userData.full_name || '',
    display_name: userData.full_name || userData.email || 'User',
    avatar_url: resolvedAvatar || undefined,
    phone: userData.phone || undefined,
    designation: userData.designation || 'Team Member',
    department_id: userData.department_id || undefined,
    department_name: userData.department_name || 'General',
    employment_status: userData.employment_status || 'Employee',
    is_active: userData.is_active ?? true,
    linkedin: userData.linkedin || undefined,
    github: userData.github || undefined,
    joining_date: userData.joining_date || undefined,
  };

  const role = userData.role || null;
  const session = accessToken ? { accessToken } : null;

  return { user, profile, role, session };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    role: null,
    loading: true,
    error: null,
    refreshProfile: async () => {},
    signIn: async () => {},
    signOut: async () => {},
  });

  const refreshProfile = async (): Promise<void> => {
    try {
      const userData = await authApi.getMe();
      const token = authSession.getAccessToken();
      const { user, profile, role, session } = formatAuthData(userData as unknown as RawUserData, token);
      setState(prev => ({
        ...prev,
        session,
        user,
        profile,
        role,
        error: null,
      }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
      }
    }
  };

  const signIn = async (credentials: LoginRequest): Promise<void> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await authApi.login(credentials);
      const { user, profile, role, session } = formatAuthData(data.user as unknown as RawUserData, data.accessToken);
      setState({
        session,
        user,
        profile,
        role,
        loading: false,
        error: null,
        refreshProfile,
        signIn,
        signOut,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Login failed');
      setState(prev => ({
        ...prev,
        session: null,
        user: null,
        profile: null,
        role: null,
        loading: false,
        error: message,
      }));
      throw err;
    }
  };

  const signOut = async (): Promise<void> => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      await authApi.logout();
    } catch (err) {
      console.warn('Backend logout failed, clearing local state:', err);
    } finally {
      authSession.clearAccessToken();
      setState({
        session: null,
        user: null,
        profile: null,
        role: null,
        loading: false,
        error: null,
        refreshProfile,
        signIn,
        signOut,
      });
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initAuthSession = async () => {
      try {
        // Attempt silent session restoration via backend refresh cookie
        const refreshData = await authApi.refresh();
        if (!isMounted) return;

        if (refreshData?.accessToken && refreshData?.user) {
          const { user, profile, role, session } = formatAuthData(
            refreshData.user as unknown as RawUserData,
            refreshData.accessToken
          );
          setState({
            session,
            user,
            profile,
            role,
            loading: false,
            error: null,
            refreshProfile,
            signIn,
            signOut,
          });
          return;
        }

        setState(prev => ({
          ...prev,
          session: null,
          user: null,
          profile: null,
          role: null,
          loading: false,
          error: null,
          refreshProfile,
          signIn,
          signOut,
        }));
      } catch {
        if (isMounted) {
          authSession.clearAccessToken();
          setState(prev => ({
            ...prev,
            session: null,
            user: null,
            profile: null,
            role: null,
            loading: false,
            error: null,
            refreshProfile,
            signIn,
            signOut,
          }));
        }
      }
    };

    initAuthSession();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
