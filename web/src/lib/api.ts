import type { AdminProfile } from '../types';

const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

interface ApiFailureBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  let parsed: ApiSuccessBody<T> | ApiFailureBody | null = null;
  try {
    parsed = (await response.json()) as ApiSuccessBody<T> | ApiFailureBody;
  } catch {
    parsed = null;
  }

  if (!response.ok || !parsed || parsed.success === false) {
    const failure = parsed && parsed.success === false ? parsed.error : null;
    throw new ApiError(
      response.status,
      failure?.code ?? 'REQUEST_FAILED',
      failure?.message ?? `Request failed with status ${response.status}`,
      failure?.details,
    );
  }

  return parsed.data;
}

export async function apiDownload(
  path: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });

  if (!response.ok) {
    let failure: ApiFailureBody['error'] | null = null;
    try {
      const body = (await response.json()) as ApiFailureBody;
      if (body && body.success === false) failure = body.error;
    } catch {
      failure = null;
    }
    throw new ApiError(
      response.status,
      failure?.code ?? 'DOWNLOAD_FAILED',
      failure?.message ?? `Download failed with status ${response.status}`,
      failure?.details,
    );
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return {
    blob: await response.blob(),
    filename: match?.[1] ?? 'download.csv',
  };
}

export async function fetchAdminSession(): Promise<AdminProfile | null> {  try {
    const data = await apiFetch<{ admin: AdminProfile }>('/api/admin/auth/session');
    return data.admin;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (
    error instanceof ApiError &&
    error.details &&
    typeof error.details === 'object' &&
    !Array.isArray(error.details)
  ) {
    const entries = Object.entries(error.details as Record<string, unknown>);
    const result: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (typeof value === 'string') result[key] = value;
    }
    return result;
  }
  return {};
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
