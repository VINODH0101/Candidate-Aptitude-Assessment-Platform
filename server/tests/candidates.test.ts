import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin, newAgent } from './helpers/factories';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const validPayload = {
  fullName: 'Jane Doe',
  email: '  Jane.Doe@Example.com ',
  password: 'StrongPass123!',
  age: 29,
  phone: '9876543210',
  gender: 'FEMALE',
  highestQualification: 'BACHELORS',
  city: 'Bengaluru',
};

const REGISTER_PATH = '/api/candidate/register';

function register(payload: Record<string, unknown>) {
  return request(app).post(REGISTER_PATH).send(payload);
}

function secret(): string {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error('JWT_ACCESS_SECRET is missing in tests');
  return value;
}

describe('candidate registration', () => {
  it('registers a candidate, normalizes the email and never returns the hash', async () => {
    const response = await register(validPayload);

    expect(response.status).toBe(201);
    expect(response.body.data.candidate).toMatchObject({
      fullName: 'Jane Doe',
      email: 'jane.doe@example.com',
      age: 29,
      phone: '9876543210',
      gender: 'FEMALE',
      highestQualification: 'BACHELORS',
      city: 'Bengaluru',
    });
    const payload = JSON.stringify(response.body);
    expect(payload).not.toContain('passwordHash');
    expect(payload).not.toContain('StrongPass123');

    const stored = await prisma.candidate.findUnique({
      where: { email: 'jane.doe@example.com' },
    });
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toBe('StrongPass123!');
    expect(stored?.passwordHash.startsWith('$2')).toBe(true);
  });

  it('sets an HttpOnly candidate session cookie on registration', async () => {
    const agent = newAgent(app);
    const response = await agent.post(REGISTER_PATH).send(validPayload);
    expect(response.status).toBe(201);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const candidateCookie = cookies.find((cookie) =>
      cookie.startsWith('candidate_token='),
    );
    expect(candidateCookie).toBeDefined();
    expect(candidateCookie?.toLowerCase()).toContain('httponly');
    expect(candidateCookie?.toLowerCase()).toContain('samesite=lax');

    const session = await agent.get('/api/candidate/session');
    expect(session.status).toBe(200);
    expect(session.body.data.candidate.email).toBe('jane.doe@example.com');
  });

  it('allows optional gender and city to be omitted', async () => {
    const response = await register({
      ...validPayload,
      email: 'optional@example.com',
      gender: undefined,
      city: undefined,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.candidate.gender).toBeNull();
    expect(response.body.data.candidate.city).toBeNull();
  });

  it('rejects duplicate emails with a friendly field-specific error', async () => {
    await register(validPayload);
    const duplicate = await register({
      ...validPayload,
      email: 'jane.doe@example.com',
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');
    expect(duplicate.body.error.details.email).toBe(
      'This email is already registered.',
    );
    expect(await prisma.candidate.count()).toBe(1);
  });

  it('treats email uniqueness case-insensitively', async () => {
    await register({ ...validPayload, email: 'Case@Example.com' });
    const duplicate = await register({
      ...validPayload,
      email: 'case@example.com',
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('handles simultaneous duplicate registrations without crashing', async () => {
    const responses = await Promise.all([register(validPayload), register(validPayload)]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect(
      await prisma.candidate.count({ where: { email: 'jane.doe@example.com' } }),
    ).toBe(1);
  });

  it('returns friendly, field-specific validation errors', async () => {
    const response = await register({
      fullName: 'Jane1',
      email: 'not-an-email',
      password: 'short',
      age: 17,
      phone: '12345',
      gender: 'ALIEN',
      highestQualification: 'PHD',
      city: 'x'.repeat(101),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const details = response.body.error.details as Record<string, string>;
    for (const field of [
      'fullName',
      'email',
      'password',
      'age',
      'phone',
      'gender',
      'highestQualification',
      'city',
    ]) {
      expect(details[field], `expected an error for ${field}`).toBeDefined();
    }
  });

  it('enforces age and phone boundaries', async () => {
    const age18 = await register({ ...validPayload, email: 'age18@example.com', age: 18 });
    const age60 = await register({ ...validPayload, email: 'age60@example.com', age: 60 });
    const age17 = await register({ ...validPayload, email: 'age17@example.com', age: 17 });
    const age61 = await register({ ...validPayload, email: 'age61@example.com', age: 61 });
    const phone9 = await register({ ...validPayload, email: 'p9@example.com', phone: '123456789' });
    const phone11 = await register({ ...validPayload, email: 'p11@example.com', phone: '12345678901' });

    expect(age18.status).toBe(201);
    expect(age60.status).toBe(201);
    expect(age17.status).toBe(400);
    expect(age61.status).toBe(400);
    expect(phone9.status).toBe(400);
    expect(phone11.status).toBe(400);
    expect(age17.body.error.details.age).toBeDefined();
    expect(phone9.body.error.details.phone).toBeDefined();
  });

  it('rejects attempts to set server-managed identity fields', async () => {
    const response = await register({
      ...validPayload,
      email: 'tamper@example.com',
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.id).toBe('This field is not allowed');
    expect(response.body.error.details.createdAt).toBe('This field is not allowed');
  });

  it('does not expose a candidate update endpoint', async () => {
    const response = await request(app).put(REGISTER_PATH).send(validPayload);
    expect(response.status).toBe(404);
  });

  it('enforces email uniqueness at the database level', async () => {
    await prisma.candidate.create({
      data: {
        fullName: 'Direct Insert',
        email: 'unique@example.com',
        passwordHash: 'hashed',
        age: 25,
        phone: '9999999999',
        highestQualification: 'MASTERS',
      },
    });

    await expect(
      prisma.candidate.create({
        data: {
          fullName: 'Duplicate Insert',
          email: 'unique@example.com',
          passwordHash: 'hashed',
          age: 30,
          phone: '8888888888',
          highestQualification: 'DIPLOMA',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('candidate authentication', () => {
  it('logs in with valid credentials and logs out', async () => {
    await register(validPayload);
    const agent = newAgent(app);

    const login = await agent
      .post('/api/candidate/login')
      .send({ email: 'jane.doe@example.com', password: 'StrongPass123!' });
    expect(login.status).toBe(200);
    expect(login.body.data.candidate.email).toBe('jane.doe@example.com');

    const session = await agent.get('/api/candidate/session');
    expect(session.status).toBe(200);

    const logout = await agent.post('/api/candidate/logout');
    expect(logout.status).toBe(200);
    const afterLogout = await agent.get('/api/candidate/session');
    expect(afterLogout.status).toBe(401);
  });

  it('returns generic errors for wrong passwords and unknown emails', async () => {
    await register(validPayload);

    const wrong = await request(app)
      .post('/api/candidate/login')
      .send({ email: 'jane.doe@example.com', password: 'WrongPass123!' });
    const unknown = await request(app)
      .post('/api/candidate/login')
      .send({ email: 'nobody@example.com', password: 'Whatever123!' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.message).toBe('Invalid email or password');
    expect(unknown.body.error.message).toBe('Invalid email or password');
  });

  it('rejects missing, invalid and expired candidate tokens', async () => {
    const profile = (
      await register(validPayload)
    ).body.data.candidate as { id: string };

    const missing = await request(app).get('/api/candidate/session');
    expect(missing.status).toBe(401);

    const invalid = await request(app)
      .get('/api/candidate/session')
      .set('Cookie', 'candidate_token=not-a-jwt');
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('AUTH_INVALID');

    const expiredToken = jwt.sign({ kind: 'candidate' }, secret(), {
      subject: profile.id,
      expiresIn: -10,
      algorithm: 'HS256',
    });
    const expired = await request(app)
      .get('/api/candidate/session')
      .set('Cookie', `candidate_token=${expiredToken}`);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('keeps candidate and admin sessions separate', async () => {
    const candidateAgent = newAgent(app);
    await candidateAgent.post(REGISTER_PATH).send(validPayload);

    const adminOnCandidate = await candidateAgent.get('/api/admin/overview');
    expect(adminOnCandidate.status).toBe(401);

    await createAdmin();
    const adminAgent = await loginAdmin(app);
    const candidateOnAdmin = await adminAgent.get('/api/candidate/session');
    expect(candidateOnAdmin.status).toBe(401);
  });
});
