import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { login, verifyToken, getAllowedSites } from '../controllers/authController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/login', upload.none(), login);

// Protected routes (authentication required)
router.get('/verify', authenticateJWT, verifyToken);
router.get('/customer_list', authenticateJWT, getAllowedSites);

export default router;
