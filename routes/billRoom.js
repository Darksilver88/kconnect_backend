import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBillRoom, getBillRoomList, getBillRoomAppList, getBillRoomDetail, getCurrentBillRoom, getBillRoomHistory, getRemainSummery } from '../controllers/billRoomController.js';
import { authenticateJWT, verifyCustomerAccess, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// App routes (optional auth - no token required)
router.get('/current_bill_room', optionalAuth, getCurrentBillRoom);
router.get('/remain_summery', optionalAuth, getRemainSummery);
router.get('/history', optionalAuth, getBillRoomHistory);
router.get('/app_list', optionalAuth, getBillRoomAppList);
router.get('/:id', optionalAuth, getBillRoomDetail);

// Apply authentication middleware to remaining routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Web routes (require auth)
router.post('/insert', upload.none(), insertBillRoom);
router.get('/list', getBillRoomList);

export default router;
