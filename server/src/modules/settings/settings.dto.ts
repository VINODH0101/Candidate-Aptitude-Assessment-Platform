import type { AppSetting } from '@prisma/client';

export interface SettingsDto {
  id: number;
  assessmentDurationMinutes: number;
  passPercentage: number;
  updatedAt: string;
}

export function toSettingsDto(settings: AppSetting): SettingsDto {
  return {
    id: settings.id,
    assessmentDurationMinutes: settings.assessmentDurationMinutes,
    passPercentage: settings.passPercentage,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
