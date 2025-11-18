import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBillRoom, getBillRoomList, getBillRoomAppList, getBillRoomDetail, getCurrentBillRoom, getBillRoomHistory, getRemainSummery } from '../controllers/billRoomController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Bill Room routes
router.post('/insert', upload.none(), insertBillRoom);
router.get('/list', getBillRoomList);
router.get('/app_list', getBillRoomAppList);
router.get('/current_bill_room', getCurrentBillRoom);
router.get('/history', getBillRoomHistory);
router.get('/remain_summery', getRemainSummery);
router.get('/:id', getBillRoomDetail);

export default router;
