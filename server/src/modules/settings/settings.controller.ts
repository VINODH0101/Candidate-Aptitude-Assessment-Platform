import type { Request, Response } from 'express';
import { asyncHandler, sendData } from '../../lib/http';
import { getSettingsDto, updateSettings } from './settings.service';
import type { UpdateSettingsInput } from './settings.schemas';

export const getSettingsHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    const settings = await getSettingsDto();
    sendData(res, { settings });
  },
);

export const updateSettingsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const input = req.body as UpdateSettingsInput;
    const settings = await updateSettings(input);
    sendData(res, { settings });
  },
);
