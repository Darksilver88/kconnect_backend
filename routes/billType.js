import express from 'express';
import { getBillTypeList } from '../controllers/billTypeController.js';
import { authenticateJWT, verifyCustomerAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateJWT);
router.use(verifyCustomerAccess);

// Bill Type routes
router.get('/list', getBillTypeList);

export default router;
