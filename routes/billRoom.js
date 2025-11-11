import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBillRoom, getBillRoomList, getBillRoomAppList, getBillRoomDetail, getCurrentBillRoom } from '../controllers/billRoomController.js';

const router = express.Router();

// Bill Room routes
router.post('/insert', upload.none(), insertBillRoom);
router.get('/list', getBillRoomList);
router.get('/app_list', getBillRoomAppList);
router.get('/current_bill_room', getCurrentBillRoom);
router.get('/:id', getBillRoomDetail);

export default router;
