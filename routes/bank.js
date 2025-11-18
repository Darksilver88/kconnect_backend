import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBank, getBankList, getBankDetail, updateBank, deleteBank, getMasterBankList } from '../controllers/bankController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Bank routes
router.post('/insert', upload.none(), insertBank);
router.get('/master_list', getMasterBankList);
router.get('/list', getBankList);
router.get('/:id', getBankDetail);
router.put('/update', upload.none(), updateBank);
router.delete('/delete', upload.none(), deleteBank);

export default router;
