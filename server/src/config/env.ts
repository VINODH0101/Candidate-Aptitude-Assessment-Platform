import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ADMIN_SESSION_HOURS: z.coerce.number().int().positive().max(720).default(8),
  CANDIDATE_SESSION_HOURS: z.coerce.number().int().positive().max(720).default(12),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration -> ${issues}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';

// Refuse to run in production with a well-known placeholder signing secret.
// (Local development and tests may use short-lived throwaway secrets.)
const INSECURE_SECRET_PATTERNS = [
  /change[-_ ]?me/i,
  /please[-_ ]?change/i,
  /please[-_ ]?use/i,
  /dev[-_ ]?only/i,
  /replace[-_ ]?me/i,
  /^secret$/i,
];

if (
  isProduction &&
  INSECURE_SECRET_PATTERNS.some((pattern) => pattern.test(env.JWT_ACCESS_SECRET))
) {
  throw new Error(
    'JWT_ACCESS_SECRET is a placeholder. Set a strong, unique 32+ character secret before running in production.',
  );
}

// Secure by default in production; can be explicitly disabled for local HTTP demos.
export const cookieSecure =
  env.COOKIE_SECURE === undefined ? isProduction : env.COOKIE_SECURE === 'true';

export const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isLoopbackOrigin(normalizedOrigin: string): boolean {
  try {
    const hostname = new URL(normalizedOrigin).hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/**
 * Returns true when `origin` is allowed:
 *  - it matches the server's own origin (a same-origin request), or
 *  - it is explicitly listed in `CORS_ORIGIN`, or
 *  - it is a loopback origin (localhost / 127.0.0.1 / ::1) and the app is NOT
 *    running in production (so the Vite dev proxy works regardless of hostname
 *    or port).
 * A missing Origin header (non-browser client) is always allowed.
 */
export function isOriginAllowed(
  origin: string | undefined,
  protocol: string,
  host: string | undefined,
): boolean {
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  if (host) {
    const ownOrigin = normalizeOrigin(`${protocol}://${host}`);
    if (ownOrigin && ownOrigin === normalized) {
      return true;
    }
  }

  if (allowedOrigins.some((allowed) => normalizeOrigin(allowed) === normalized)) {
    return true;
  }

  if (!isProduction && isLoopbackOrigin(normalized)) {
    return true;
  }

  return false;
}
