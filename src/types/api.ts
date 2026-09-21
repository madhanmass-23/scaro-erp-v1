/**
 * Standard API Types and Envelopes for SCARO ERP Frontend Client.
 * Adheres strictly to the Phase 2E Backend API Contract.
 */

export interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiListResponse<T> {
  success: true;
  data: T[];
  pagination?: ApiPagination;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse;
export type ApiListResult<T> = ApiListResponse<T> | ApiErrorResponse;

/**
 * Authentication DTO contracts
 */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserAuthContext {
  id: string;
  email: string;
  full_name: string;
  role: string;
  role_id: string;
  department_id?: string | null;
  department_name?: string | null;
  designation?: string | null;
  avatar_url?: string | null;
  permissions: string[];
}

export interface LoginResponseData {
  accessToken: string;
  user: UserAuthContext;
}

export interface RefreshResponseData {
  accessToken: string;
  user: UserAuthContext;
}

export interface ChangePasswordRequest {
  currentPassword?: string;
  newPassword?: string;
  current_password?: string;
  new_password?: string;
}
