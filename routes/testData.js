import express from 'express';
import { insertTestData, getTestDataList, createNewsAttachment, createAppConfig } from '../controllers/testDataController.js';

const router = express.Router();

// router.post('/insert_data', insertTestData);
router.get('/insert_data', insertTestData);
router.get('/list_data', getTestDataList);
router.get('/create_news_attachment', createNewsAttachment);
router.get('/create_app_config', createAppConfig);

export default router;