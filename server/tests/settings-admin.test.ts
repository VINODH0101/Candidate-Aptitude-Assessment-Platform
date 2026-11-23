import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin } from './helpers/factories';
import { createActiveQuestions, createCandidate } from './helpers/domain';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('assessment settings', () => {
  it('returns the defaults: 15 minutes and 60 percent', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);

    const response = await admin.get('/api/admin/settings');
    expect(response.status).toBe(200);
    expect(response.body.data.settings).toMatchObject({
      id: 1,
      assessmentDurationMinutes: 15,
      passPercentage: 60,
    });
  });

  it('updates settings within valid ranges', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);

    const updated = await admin.put('/api/admin/settings').send({
      assessmentDurationMinutes: 45,
      passPercentage: 75,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.settings).toMatchObject({
      assessmentDurationMinutes: 45,
      passPercentage: 75,
    });

    const fetched = await admin.get('/api/admin/settings');
    expect(fetched.body.data.settings).toMatchObject({
      assessmentDurationMinutes: 45,
      passPercentage: 75,
    });
  });

  it('rejects unreasonable configuration values', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);

    const tooShort = await admin.put('/api/admin/settings').send({
      assessmentDurationMinutes: 4,
      passPercentage: 60,
    });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.error.details.assessmentDurationMinutes).toBeDefined();

    const tooLong = await admin.put('/api/admin/settings').send({
      assessmentDurationMinutes: 181,
      passPercentage: 60,
    });
    expect(tooLong.status).toBe(400);

    const passTooLow = await admin.put('/api/admin/settings').send({
      assessmentDurationMinutes: 15,
      passPercentage: 0,
    });
    expect(passTooLow.status).toBe(400);
    expect(passTooLow.body.error.details.passPercentage).toBeDefined();

    const passTooHigh = await admin.put('/api/admin/settings').send({
      assessmentDurationMinutes: 15,
      passPercentage: 101,
    });
    expect(passTooHigh.status).toBe(400);
  });

  it('keeps existing attempts at their original duration and pass percentage', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);
    await createActiveQuestions(admin, 10);
    const candidate = await createCandidate();

    const started = await admin
      .post('/api/admin/attempts/start')
      .send({ candidateId: candidate.id });
    expect(started.status).toBe(201);
    expect(started.body.data.attempt).toMatchObject({
      durationMinutes: 15,
      passPercentage: 60,
    });

    const updated = await admin.put('/api/admin/settings').send({
      assessmentDurationMinutes: 45,
      passPercentage: 80,
    });
    expect(updated.status).toBe(200);

    const stored = await prisma.testAttempt.findUnique({
      where: { candidateId: candidate.id },
    });
    expect(stored?.durationMinutes).toBe(15);
    expect(stored?.passPercentage).toBe(60);
  });

  it('requires an admin session', async () => {
    const anonymousGet = await request(app).get('/api/admin/settings');
    expect(anonymousGet.status).toBe(401);

    const anonymousPut = await request(app).put('/api/admin/settings').send({
      assessmentDurationMinutes: 30,
      passPercentage: 70,
    });
    expect(anonymousPut.status).toBe(401);
  });
});
