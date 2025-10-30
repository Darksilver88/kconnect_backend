import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBillRoom, getBillRoomList, getBillRoomDetail } from '../controllers/billRoomController.js';

const router = express.Router();

// Bill Room routes
router.post('/insert', upload.none(), insertBillRoom);
router.get('/list', getBillRoomList);
router.get('/:id', getBillRoomDetail);

export default router;
