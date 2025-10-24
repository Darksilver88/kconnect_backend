import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBillTransaction, getBillTransactionType } from '../controllers/billTransactionController.js';

const router = express.Router();

// Bill Transaction routes
router.post('/insert', upload.none(), insertBillTransaction);
router.get('/bill_transaction_type', getBillTransactionType);

export default router;
