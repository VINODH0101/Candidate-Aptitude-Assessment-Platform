import request from 'supertest';
import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import type { Admin } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';

export const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
export const DEFAULT_ADMIN_PASSWORD = 'AdminPass123!';

export type Agent = ReturnType<typeof request.agent>;

export function newAgent(app: Express): Agent {
  return request.agent(app);
}

export async function createAdmin(input?: {
  email?: string;
  password?: string;
  name?: string;
}): Promise<Admin> {
  const email = (input?.email ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const password = input?.password ?? DEFAULT_ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 8);
  return prisma.admin.create({
    data: {
      email,
      name: input?.name ?? 'Test Admin',
      passwordHash,
    },
  });
}

export async function loginAdmin(
  app: Express,
  email = DEFAULT_ADMIN_EMAIL,
  password = DEFAULT_ADMIN_PASSWORD,
): Promise<Agent> {
  const agent = request.agent(app);
  const response = await agent.post('/api/admin/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(
      `Admin login failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return agent;
}
