import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBank, getBankList, getBankDetail, updateBank, deleteBank, getMasterBankList } from '../controllers/bankController.js';
import { authenticateJWT, verifyCustomerAccess, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// App routes (optional auth)
router.get('/list', optionalAuth, getBankList);

// Apply authentication middleware to remaining routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Web routes (require auth)
router.post('/insert', upload.none(), insertBank);
router.get('/master_list', getMasterBankList);
router.get('/:id', getBankDetail);
router.put('/update', upload.none(), updateBank);
router.delete('/delete', upload.none(), deleteBank);

export default router;
