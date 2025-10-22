import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertPayment, updatePayment, getPaymentList, getPaymentSummaryStatus, getPaymentDetail, getPaymentSummaryData } from '../controllers/paymentController.js';

const router = express.Router();

// Payment routes
router.post('/insert', upload.none(), insertPayment);
router.put('/update', upload.none(), updatePayment);
router.get('/list', getPaymentList);
router.get('/summary_status', getPaymentSummaryStatus);
router.get('/get_summary_data', getPaymentSummaryData);
router.get('/:id', getPaymentDetail);

export default router;
