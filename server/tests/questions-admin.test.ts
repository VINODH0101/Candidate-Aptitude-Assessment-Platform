import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin, type Agent } from './helpers/factories';
import {
  createActiveQuestions,
  createCandidate,
  createQuestion,
  questionPayload,
} from './helpers/domain';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setupAdmin(): Promise<Agent> {
  await createAdmin();
  return loginAdmin(app);
}

describe('admin question management', () => {
  it('creates questions inactive by default and lists with filters', async () => {
    const admin = await setupAdmin();
    const quantitativeEasy = await createQuestion(admin, 1, {
      category: 'QUANTITATIVE',
      difficulty: 'EASY',
    });
    await createQuestion(admin, 2, { category: 'LOGICAL', difficulty: 'HARD' });
    await createQuestion(admin, 3, { category: 'VERBAL', difficulty: 'EASY' }, true);

    expect(quantitativeEasy.isActive).toBe(false);

    const all = await admin.get('/api/admin/questions?pageSize=100');
    expect(all.status).toBe(200);
    expect(all.body.data.items).toHaveLength(3);
    expect(all.body.data.activeCount).toBe(1);
    expect(all.body.data.maxActiveQuestions).toBe(10);

    const search = await admin.get('/api/admin/questions?search=question%202');
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].category).toBe('LOGICAL');

    const byCategory = await admin.get('/api/admin/questions?category=LOGICAL');
    expect(byCategory.body.data.items).toHaveLength(1);

    const byDifficulty = await admin.get('/api/admin/questions?difficulty=HARD');
    expect(byDifficulty.body.data.items).toHaveLength(1);

    const activeOnly = await admin.get('/api/admin/questions?isActive=true');
    expect(activeOnly.body.data.items).toHaveLength(1);
    expect(activeOnly.body.data.items[0].category).toBe('VERBAL');
  });

  it('validates four non-empty distinct options and a single correct index', async () => {
    const admin = await setupAdmin();

    const threeOptions = await admin
      .post('/api/admin/questions')
      .send({ ...questionPayload(1), options: ['a', 'b', 'c'] });
    expect(threeOptions.status).toBe(400);
    expect(threeOptions.body.error.details.options).toBeDefined();

    const emptyOption = await admin
      .post('/api/admin/questions')
      .send({ ...questionPayload(2), options: ['a', '', 'c', 'd'] });
    expect(emptyOption.status).toBe(400);
    expect(
      Object.keys(emptyOption.body.error.details as Record<string, string>).some(
        (key) => key.startsWith('options'),
      ),
    ).toBe(true);

    const duplicateOptions = await admin
      .post('/api/admin/questions')
      .send({ ...questionPayload(3), options: ['a', 'a', 'b', 'c'] });
    expect(duplicateOptions.status).toBe(400);
    expect(duplicateOptions.body.error.details.options).toBe('Options must be distinct');

    const badCorrectIndex = await admin
      .post('/api/admin/questions')
      .send({ ...questionPayload(4), correctOptionIndex: 4 });
    expect(badCorrectIndex.status).toBe(400);
    expect(badCorrectIndex.body.error.details.correctOptionIndex).toBeDefined();

    const badCategory = await admin
      .post('/api/admin/questions')
      .send({ ...questionPayload(5), category: 'SPATIAL' });
    expect(badCategory.status).toBe(400);
    expect(badCategory.body.error.details.category).toBeDefined();
  });

  it('edits questions and rejects duplicate question text', async () => {
    const admin = await setupAdmin();
    const first = await createQuestion(admin, 1);
    const second = await createQuestion(admin, 2);

    const updated = await admin.put(`/api/admin/questions/${first.id}`).send({
      questionText: 'Updated corporate aptitude question text?',
      options: ['One', 'Two', 'Three', 'Four'],
      correctOptionIndex: 2,
      category: 'VERBAL',
      difficulty: 'HARD',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.question).toMatchObject({
      questionText: 'Updated corporate aptitude question text?',
      correctOptionIndex: 2,
      category: 'VERBAL',
      difficulty: 'HARD',
    });

    const duplicate = await admin.put(`/api/admin/questions/${second.id}`).send({
      questionText: 'Updated corporate aptitude question text?',
      options: ['One', 'Two', 'Three', 'Four'],
      correctOptionIndex: 0,
      category: 'LOGICAL',
      difficulty: 'EASY',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('QUESTION_EXISTS');
  });

  it('enforces the maximum of 10 active questions (service + database)', async () => {
    const admin = await setupAdmin();
    await createActiveQuestions(admin, 10);
    const eleventh = await createQuestion(admin, 11);

    const activation = await admin
      .patch(`/api/admin/questions/${eleventh.id}/status`)
      .send({ isActive: true });
    expect(activation.status).toBe(409);
    expect(activation.body.error.code).toBe('MAX_ACTIVE_QUESTIONS_REACHED');

    await expect(
      prisma.question.update({
        where: { id: eleventh.id },
        data: { isActive: true },
      }),
    ).rejects.toThrow();

    const first = await admin.get('/api/admin/questions?isActive=true');
    const firstId = first.body.data.items[0].id as string;
    await admin.patch(`/api/admin/questions/${firstId}/status`).send({ isActive: false });

    const reactivated = await admin
      .patch(`/api/admin/questions/${eleventh.id}/status`)
      .send({ isActive: true });
    expect(reactivated.status).toBe(200);
  });

  it('deletes unused questions but blocks questions referenced by attempts', async () => {
    const admin = await setupAdmin();
    const unused = await createQuestion(admin, 1);
    const deleted = await admin.delete(`/api/admin/questions/${unused.id}`);
    expect(deleted.status).toBe(200);

    const questions = await createActiveQuestions(admin, 10);
    const candidate = await createCandidate();
    const started = await admin
      .post('/api/admin/attempts/start')
      .send({ candidateId: candidate.id });
    expect(started.status).toBe(201);

    const referenced = questions[0];
    if (!referenced) throw new Error('missing question');
    const blocked = await admin.delete(`/api/admin/questions/${referenced.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('QUESTION_IN_USE');
  });

  it('requires an admin session for every question endpoint', async () => {
    const anonymous = await request(app).get('/api/admin/questions');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');
  });
});
