import { buildTestDatabaseUrl } from './test-db';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = buildTestDatabaseUrl();
process.env.JWT_ACCESS_SECRET ??=
  'test-only-admin-jwt-secret-0123456789abcdef0123456789abcdef';
process.env.ADMIN_SESSION_HOURS = '8';
process.env.BCRYPT_ROUNDS = '8';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.COOKIE_SECURE = 'false';
