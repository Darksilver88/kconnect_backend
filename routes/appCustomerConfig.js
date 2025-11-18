import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { initAppCustomerConfig, updateAppCustomerConfig, getAppCustomerConfigList } from '../controllers/appCustomerConfigController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// App customer config routes
router.post('/init_config', upload.none(), initAppCustomerConfig);
router.put('/update', upload.none(), updateAppCustomerConfig);
router.get('/list', getAppCustomerConfigList);

export default router;
