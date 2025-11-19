import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertMember, getMemberList, getMemberDetail, getMemberIDByHouseNo } from '../controllers/memberController.js';
import { authenticateJWT, verifyCustomerAccess, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// App routes (optional auth)
router.get('/getMemberIDByHouseNo', optionalAuth, getMemberIDByHouseNo);

// Apply authentication middleware to remaining routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Web routes (require auth)
router.post('/insert', upload.none(), insertMember);
router.get('/list', getMemberList);
router.get('/:id', getMemberDetail);

export default router;
