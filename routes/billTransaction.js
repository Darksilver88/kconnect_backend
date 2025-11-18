import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBillTransaction, getBillTransactionDetail, getBillTransactionType } from '../controllers/billTransactionController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Bill Transaction routes
router.post('/insert', upload.none(), insertBillTransaction);
router.get('/bill_transaction_type', getBillTransactionType);
router.get('/:id', getBillTransactionDetail);

export default router;
