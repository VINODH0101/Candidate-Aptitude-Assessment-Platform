import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import {
  createAdmin,
  loginAdmin,
  newAgent,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
} from './helpers/factories';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function secret(): string {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error('JWT_ACCESS_SECRET is missing in tests');
  return value;
}

describe('admin authentication', () => {
  it('logs in, sets an HttpOnly SameSite cookie and validates the session', async () => {
    await createAdmin({ email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });
    const agent = newAgent(app);

    const response = await agent
      .post('/api/admin/auth/login')
      .send({ email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.admin).toMatchObject({
      email: DEFAULT_ADMIN_EMAIL,
      name: 'Test Admin',
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const adminCookie = cookies.find((cookie) => cookie.startsWith('admin_token='));
    expect(adminCookie).toBeDefined();
    expect(adminCookie?.toLowerCase()).toContain('httponly');
    expect(adminCookie?.toLowerCase()).toContain('samesite=lax');

    const session = await agent.get('/api/admin/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.data.admin.email).toBe(DEFAULT_ADMIN_EMAIL);
  });

  it('returns the same generic failure for wrong password and unknown email', async () => {
    await createAdmin({ email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });

    const wrongPassword = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: DEFAULT_ADMIN_EMAIL, password: 'WrongPass123!' });
    const unknownEmail = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'nobody@example.com', password: 'Whatever123!' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.error.message).toBe('Invalid email or password');
    expect(unknownEmail.body.error.message).toBe('Invalid email or password');
  });

  it('logs out by clearing the cookie and invalidating the cookie session', async () => {
    await createAdmin();
    const agent = await loginAdmin(app);

    const beforeLogout = await agent.get('/api/admin/auth/session');
    expect(beforeLogout.status).toBe(200);

    const logout = await agent.post('/api/admin/auth/logout');
    expect(logout.status).toBe(200);

    const afterLogout = await agent.get('/api/admin/auth/session');
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects missing, invalid and expired tokens', async () => {
    const admin = await createAdmin();

    const missing = await request(app).get('/api/admin/auth/session');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('AUTH_REQUIRED');

    const invalid = await request(app)
      .get('/api/admin/auth/session')
      .set('Cookie', 'admin_token=not-a-jwt');
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('AUTH_INVALID');

    const expiredToken = jwt.sign({ type: 'admin' }, secret(), {
      subject: admin.id,
      expiresIn: -10,
      algorithm: 'HS256',
    });
    const expired = await request(app)
      .get('/api/admin/auth/session')
      .set('Cookie', `admin_token=${expiredToken}`);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('protects every admin endpoint with the auth middleware', async () => {
    await createAdmin();

    const anonymous = await request(app).get('/api/admin/overview');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');

    const agent = await loginAdmin(app);
    const authorized = await agent.get('/api/admin/overview');
    expect(authorized.status).toBe(200);
    expect(authorized.body.data.overview).toMatchObject({
      candidates: 0,
      attempts: 0,
      admins: 1,
      activeQuestions: 0,
    });
  });

  it('rejects a validly signed token that does not belong to an admin', async () => {
    const candidate = await prisma.candidate.create({
      data: {
        fullName: 'Not An Admin',
        email: 'candidate@example.com',
        passwordHash: 'hashed',
        age: 24,
        phone: '9876543210',
        highestQualification: 'BACHELORS',
      },
    });

    const token = jwt.sign({ type: 'admin' }, secret(), {
      subject: candidate.id,
      expiresIn: 3600,
      algorithm: 'HS256',
    });

    const response = await request(app)
      .get('/api/admin/overview')
      .set('Cookie', `admin_token=${token}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID');
  });

  it('never returns password hashes from any admin endpoint', async () => {
    const admin = await createAdmin();
    const agent = await loginAdmin(app);

    const session = await agent.get('/api/admin/auth/session');
    const overview = await agent.get('/api/admin/overview');

    for (const body of [session.body, overview.body]) {
      const payload = JSON.stringify(body);
      expect(payload).not.toContain('passwordHash');
      expect(payload).not.toContain(admin.passwordHash);
    }
  });

  it('applies rate limiting headers to admin login', async () => {
    await createAdmin();
    const response = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });

    expect(response.headers['ratelimit']).toBeDefined();
  });
});
