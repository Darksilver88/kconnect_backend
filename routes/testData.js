import express from 'express';
import { insertTestData, getTestDataList, createNewsAttachment, createAppConfig, createRoomInformation, createMemberInformation } from '../controllers/testDataController.js';

const router = express.Router();

// router.post('/insert_data', insertTestData);
router.get('/insert_data', insertTestData);
router.get('/list_data', getTestDataList);
router.get('/create_news_attachment', createNewsAttachment);
router.get('/create_app_config', createAppConfig);
router.get('/create_room_information', createRoomInformation);
router.get('/create_member_information', createMemberInformation);

export default router;