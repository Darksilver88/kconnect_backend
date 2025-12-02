import express from 'express';
import { getAppConfig } from '../controllers/appConfigController.js';

const router = express.Router();

// Public route (no authentication required)
router.get('/get_app_config', getAppConfig);

export default router;
