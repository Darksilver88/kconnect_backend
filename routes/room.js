import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertRoom, getRoomList, getSummaryData } from '../controllers/roomController.js';

const router = express.Router();

// Room routes
router.post('/insert', upload.none(), insertRoom);
router.get('/get_summary_data', getSummaryData);
router.get('/list', getRoomList);

export default router;
