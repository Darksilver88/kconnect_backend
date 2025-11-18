import express from 'express';
import { getPaymentTypeList } from '../controllers/paymentTypeController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Payment Type routes
router.get('/list', getPaymentTypeList);

export default router;
