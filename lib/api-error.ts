import { NextResponse } from 'next/server';

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse<ApiError> {
  const body: ApiError = { error: message, code };
  if (details !== undefined) {
    body.details = details;
  }
  return NextResponse.json(body, { status });
}
