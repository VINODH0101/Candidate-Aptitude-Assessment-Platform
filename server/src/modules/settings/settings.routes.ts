import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import {
  getSettingsHandler,
  updateSettingsHandler,
} from './settings.controller';
import { updateSettingsSchema } from './settings.schemas';

export const settingsRouter = Router();

settingsRouter.get('/', asyncHandler(getSettingsHandler));
settingsRouter.put(
  '/',
  validate({ body: updateSettingsSchema }),
  asyncHandler(updateSettingsHandler),
);
