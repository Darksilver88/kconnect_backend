import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBill, updateBill, deleteBill, getBillDetail, getBillList, insertBillWithExcel } from '../controllers/billController.js';

const router = express.Router();

// Bill routes
router.post('/insert', upload.none(), insertBill);
router.post('/insert_with_excel', upload.none(), insertBillWithExcel);
router.put('/update', upload.none(), updateBill);
router.delete('/delete', upload.none(), deleteBill);
router.get('/list', getBillList);
router.get('/:id', getBillDetail);

export default router;
