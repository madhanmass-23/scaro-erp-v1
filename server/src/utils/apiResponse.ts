import { Response } from "express";
import { ApiResponse, ApiErrorResponse } from "../types/api.types.js";

export function sendSuccess<T>(
  res: Response,
  data?: T,
  statusCode = 200,
  extra?: Partial<ApiResponse<T>>
): void {
  const payload: ApiResponse<T> = {
    success: true,
    ...(data !== undefined ? { data } : {}),
    ...extra,
  };
  res.status(statusCode).json(payload);
}

export function sendPaginatedSuccess<T>(
  res: Response,
  data: T[],
  pagination: { page: number; limit: number; total: number; totalPages: number },
  statusCode = 200
): void {
  const payload: ApiResponse<T[]> = {
    success: true,
    data,
    pagination,
  };
  res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  details?: unknown
): void {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  res.status(statusCode).json(payload);
}
