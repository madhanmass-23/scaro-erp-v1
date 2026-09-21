/**
 * Centralized Typed API Client for SCARO ERP Frontend.
 * 
 * Features:
 * - Base URL normalization without double slashes or duplication.
 * - In-memory JWT access token injection.
 * - Secure cookie exchange via credentials: 'include'.
 * - Automated 401 interceptor with non-recursive token refresh.
 * - Standardized error envelopes and ApiError class.
 * - Full support for GET, POST, PUT, PATCH, DELETE and AbortSignal.
 */

import { authSession } from './authSession';
import type { ApiErrorResponse, ApiSuccess, ApiListResponse } from '../types/api';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code: string = 'API_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  skipRefresh?: boolean;
}

// In-flight refresh promise to prevent concurrent refresh storms
let activeRefreshPromise: Promise<string | null> | null = null;

class ApiClient {
  private getBaseUrl(): string {
    const raw = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    return raw.replace(/\/+$/, '');
  }

  /**
   * Normalizes relative endpoint paths against the configured base URL.
   */
  public normalizeUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined | null>): string {
    const baseUrl = this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    let fullUrl = `${baseUrl}${cleanEndpoint}`;

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
      }
    }

    return fullUrl;
  }

  /**
   * Internal token refresh coordinator with infinite recursion guard.
   */
  private async refreshAccessToken(): Promise<string | null> {
    if (activeRefreshPromise) {
      return activeRefreshPromise;
    }

    activeRefreshPromise = (async () => {
      try {
        const refreshUrl = this.normalizeUrl('/auth/refresh');
        const res = await fetch(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Transmit HttpOnly refresh cookie
        });

        if (!res.ok) {
          authSession.clearAccessToken();
          return null;
        }

        const data = await res.json();
        if (data?.success && data?.data?.accessToken) {
          const newToken = data.data.accessToken as string;
          authSession.setAccessToken(newToken);
          return newToken;
        }

        authSession.clearAccessToken();
        return null;
      } catch {
        authSession.clearAccessToken();
        return null;
      } finally {
        activeRefreshPromise = null;
      }
    })();

    return activeRefreshPromise;
  }

  /**
   * Core request execution pipeline.
   */
  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const {
      body,
      params,
      headers: customHeaders = {},
      skipAuth = false,
      skipRefresh = false,
      ...fetchOptions
    } = options;

    const url = this.normalizeUrl(endpoint, params);
    const headers: Record<string, string> = {
      ...(customHeaders as Record<string, string>),
    };

    // Auto JSON serialization
    let requestBody: BodyInit | undefined = undefined;
    if (body !== undefined) {
      if (body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob) {
        requestBody = body;
      } else {
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
      }
    }

    // Attach JWT Bearer if available and not skipped
    if (!skipAuth) {
      const token = authSession.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers,
        body: requestBody,
        credentials: 'include', // Ensure cookies are sent and received
      });
    } catch (networkError) {
      if (networkError instanceof DOMException && networkError.name === 'AbortError') {
        throw networkError;
      }
      throw new ApiError(
        'Unable to connect to the server. Please check your network connection.',
        0,
        'NETWORK_ERROR',
        networkError
      );
    }

    // Handle 401 Unauthorized with token refresh and single retry
    if (response.status === 401 && !skipRefresh && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
      const newToken = await this.refreshAccessToken();
      if (newToken) {
        // Retry original request with new access token and skipRefresh flag
        return this.request<T>(endpoint, {
          ...options,
          skipRefresh: true,
        });
      }
    }

    // Parse Response Body
    let parsedData: unknown = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        parsedData = await response.json();
      } catch (parseError) {
        if (!response.ok) {
          throw new ApiError(
            `Request failed with HTTP status ${response.status}`,
            response.status,
            'HTTP_ERROR',
            parseError
          );
        }
        throw new ApiError('Malformed JSON received from server.', response.status, 'MALFORMED_RESPONSE', parseError);
      }
    } else {
      const text = await response.text();
      if (!response.ok) {
        throw new ApiError(text || `Request failed with status ${response.status}`, response.status, 'HTTP_ERROR');
      }
      return text as unknown as T;
    }

    // Evaluate standard SCARO ERP response envelope
    if (response.ok) {
      if (parsedData && typeof parsedData === 'object' && 'success' in parsedData) {
        const envelope = parsedData as ApiSuccess<T> | ApiListResponse<T>;
        if (envelope.success) {
          return envelope.data as T;
        }
      }
      return parsedData as T;
    }

    // Handle structured error envelope
    if (parsedData && typeof parsedData === 'object' && 'error' in parsedData) {
      const errEnvelope = parsedData as ApiErrorResponse;
      if (errEnvelope.error) {
        throw new ApiError(
          errEnvelope.error.message || `Request failed with status ${response.status}`,
          response.status,
          errEnvelope.error.code || 'API_ERROR',
          errEnvelope.error.details
        );
      }
    }

    throw new ApiError(
      `Request failed with status ${response.status}`,
      response.status,
      this.getFallbackErrorCode(response.status)
    );
  }

  private getFallbackErrorCode(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHENTICATED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'UNPROCESSABLE_ENTITY';
      case 429: return 'RATE_LIMITED';
      case 500: return 'INTERNAL_SERVER_ERROR';
      case 503: return 'SERVICE_UNAVAILABLE';
      default:  return 'HTTP_ERROR';
    }
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  public put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  public patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
