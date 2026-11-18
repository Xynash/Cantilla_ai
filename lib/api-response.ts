import { NextResponse } from "next/server";
import { type ApiResponseSuccess, type ApiResponseError, type ApiErrorDetail } from "@/types/api";

/**
 * Return a standardized successful JSON response
 */
export function apiSuccess<T>(
  data: T,
  meta?: ApiResponseSuccess<T>["meta"],
  status: number = 200
): NextResponse<ApiResponseSuccess<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        ...meta,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

/**
 * Return a standardized error JSON response
 */
export function apiError(
  message: string,
  statusCode: number = 500,
  code: string = "INTERNAL_SERVER_ERROR",
  details?: ApiErrorDetail[]
): NextResponse<ApiResponseError> {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        code,
        statusCode,
        details,
        timestamp: new Date().toISOString(),
      },
    },
    { status: statusCode }
  );
}

/**
 * Helper for 400 Bad Request
 */
export function apiBadRequest(message: string = "Invalid request payload", details?: ApiErrorDetail[]) {
  return apiError(message, 400, "BAD_REQUEST", details);
}

/**
 * Helper for 401 Unauthorized
 */
export function apiUnauthorized(message: string = "Authentication required") {
  return apiError(message, 401, "UNAUTHORIZED");
}

/**
 * Helper for 403 Forbidden
 */
export function apiForbidden(message: string = "Permission denied") {
  return apiError(message, 403, "FORBIDDEN");
}

/**
 * Helper for 404 Not Found
 */
export function apiNotFound(message: string = "Resource not found") {
  return apiError(message, 404, "NOT_FOUND");
}
