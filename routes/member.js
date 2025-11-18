import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertMember, getMemberList, getMemberDetail, getMemberIDByHouseNo } from '../controllers/memberController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Member routes
router.post('/insert', upload.none(), insertMember);
router.get('/list', getMemberList);
router.get('/getMemberIDByHouseNo', getMemberIDByHouseNo);
router.get('/:id', getMemberDetail);

export default router;
