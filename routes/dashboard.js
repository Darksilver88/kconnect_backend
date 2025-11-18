import express from 'express';
import { getSummary, getBillingRevenue, getBillStatus, getPaymentEfficiency, getActionItems } from '../controllers/dashboardController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Dashboard routes
router.get('/summary', getSummary);
router.get('/billing_revenue', getBillingRevenue);
router.get('/bill_status', getBillStatus);
router.get('/payment_efficiency', getPaymentEfficiency);
router.get('/action_items', getActionItems);

export default router;
