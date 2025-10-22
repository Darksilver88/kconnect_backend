import express from 'express';
import { getPaymentTypeList } from '../controllers/paymentTypeController.js';

const router = express.Router();

// Payment Type routes
router.get('/list', getPaymentTypeList);

export default router;
