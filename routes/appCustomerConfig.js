import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { initAppCustomerConfig, updateAppCustomerConfig, getAppCustomerConfigList } from '../controllers/appCustomerConfigController.js';

const router = express.Router();

// App customer config routes
router.post('/init_config', upload.none(), initAppCustomerConfig);
router.put('/update', upload.none(), updateAppCustomerConfig);
router.get('/list', getAppCustomerConfigList);

export default router;
