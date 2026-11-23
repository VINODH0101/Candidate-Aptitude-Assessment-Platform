import { Prisma, type AppSetting } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  DEFAULT_ASSESSMENT_DURATION_MINUTES,
  DEFAULT_PASS_PERCENTAGE,
} from '../../config/assessment';
import { toSettingsDto, type SettingsDto } from './settings.dto';
import type { UpdateSettingsInput } from './settings.schemas';

async function findSettings(): Promise<AppSetting | null> {
  return prisma.appSetting.findUnique({ where: { id: 1 } });
}

export async function getSettings(): Promise<AppSetting> {
  const existing = await findSettings();
  if (existing) return existing;

  try {
    return await prisma.appSetting.create({
      data: {
        id: 1,
        assessmentDurationMinutes: DEFAULT_ASSESSMENT_DURATION_MINUTES,
        passPercentage: DEFAULT_PASS_PERCENTAGE,
      },
    });
  } catch (error) {
    // A concurrent request may have created the singleton first. Re-read the
    // winning row instead of surfacing a spurious duplicate/500 error.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const concurrent = await findSettings();
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

export async function getSettingsDto(): Promise<SettingsDto> {
  return toSettingsDto(await getSettings());
}

export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<SettingsDto> {
  await getSettings();
  const settings = await prisma.appSetting.update({
    where: { id: 1 },
    data: {
      assessmentDurationMinutes: input.assessmentDurationMinutes,
      passPercentage: input.passPercentage,
    },
  });
  return toSettingsDto(settings);
}
