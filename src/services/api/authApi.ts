/**
 * Authentication API Service for SCARO ERP Frontend.
 * 
 * Interacts with Node.js/Express `/api/v1/auth` endpoints.
 * Automatically synchronizes JWT access tokens in the in-memory authSession.
 */

import { api } from '../../lib/api';
import { authSession } from '../../lib/authSession';
import type {
  LoginRequest,
  LoginResponseData,
  RefreshResponseData,
  UserAuthContext,
  ChangePasswordRequest,
} from '../../types/api';

export const authApi = {
  /**
   * Authenticates user with email and password.
   * On success, updates in-memory access token.
   */
  async login(credentials: LoginRequest): Promise<LoginResponseData> {
    const data = await api.post<LoginResponseData>('/auth/login', credentials, {
      skipAuth: true,
      skipRefresh: true,
    });

    if (data?.accessToken) {
      authSession.setAccessToken(data.accessToken);
    }

    return data;
  },

  /**
   * Explicitly triggers token refresh via HttpOnly cookie.
   */
  async refresh(): Promise<RefreshResponseData> {
    const data = await api.post<RefreshResponseData>('/auth/refresh', undefined, {
      skipAuth: true,
      skipRefresh: true,
    });

    if (data?.accessToken) {
      authSession.setAccessToken(data.accessToken);
    }

    return data;
  },

  /**
   * Logs out the user on the server (invalidates auth_sessions row and clears cookie),
   * then clears in-memory access token.
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout', undefined, {
        skipRefresh: true,
      });
    } finally {
      authSession.clearAccessToken();
    }
  },

  /**
   * Fetches current authenticated user context and role permissions.
   */
  async getMe(): Promise<UserAuthContext> {
    return api.get<UserAuthContext>('/auth/me');
  },

  /**
   * Updates user password on the backend.
   */
  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    return api.post<void>('/auth/change-password', payload);
  },
};
