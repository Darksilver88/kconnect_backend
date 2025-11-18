import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertPayment, updatePayment, getPaymentList, getPaymentSummaryStatus, getPaymentSummaryStatus2, getPaymentDetail, getPaymentSummaryData } from '../controllers/paymentController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Payment routes
router.post('/insert', upload.none(), insertPayment);
router.put('/update', upload.none(), updatePayment);
router.get('/list', getPaymentList);
router.get('/summary_status', getPaymentSummaryStatus);
router.get('/summary_status2', getPaymentSummaryStatus2);
router.get('/get_summary_data', getPaymentSummaryData);
router.get('/:id', getPaymentDetail);

export default router;
