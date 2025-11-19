import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertPayment, updatePayment, getPaymentList, getPaymentSummaryStatus, getPaymentSummaryStatus2, getPaymentDetail, getPaymentSummaryData } from '../controllers/paymentController.js';
import { authenticateJWT, verifyCustomerAccess, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// App routes (optional auth)
router.post('/insert', optionalAuth, upload.none(), insertPayment);

// Apply authentication middleware to remaining routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Web routes (require auth)
router.put('/update', upload.none(), updatePayment);
router.get('/list', getPaymentList);
router.get('/summary_status', getPaymentSummaryStatus);
router.get('/summary_status2', getPaymentSummaryStatus2);
router.get('/get_summary_data', getPaymentSummaryData);
router.get('/:id', getPaymentDetail);

export default router;
