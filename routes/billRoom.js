import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBillRoom, getBillRoomList } from '../controllers/billRoomController.js';

const router = express.Router();

// Bill Room routes
router.post('/insert', upload.none(), insertBillRoom);
router.get('/list', getBillRoomList);

export default router;
