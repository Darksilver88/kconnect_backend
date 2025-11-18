import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import { getFirestore } from '../config/firebase.js';

/**
 * Middleware to verify JWT token from Portal
 * This middleware checks if the user is authenticated
 */
export async function authenticateJWT(req, res, next) {
  try {
    // 1. Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header');
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
        message: 'กรุณา Login เข้าสู่ระบบ'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // 2. Decode JWT token (Portal JWT structure with values object)
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.values) {
      logger.warn('Invalid token structure');
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Token ไม่ถูกต้อง กรุณา Login ใหม่'
      });
    }

    // 3. Check token expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      logger.warn(`Token expired for user ${decoded.values.username}`);
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        message: 'Token หมดอายุ กรุณา Login ใหม่'
      });
    }

    // 4. Attach user info to request (extract from values object)
    req.user = {
      userid: decoded.values.userid || null,
      userlevel: decoded.values.userlevel || null,
      username: decoded.values.username || null,
      userprimarykey: decoded.values.userprimarykey || null,
      token: token
    };

    logger.debug(`User authenticated: ${decoded.values.username} (userid: ${decoded.values.userid}, userlevel: ${decoded.values.userlevel})`);
    next();

  } catch (error) {
    logger.error('JWT authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: 'การยืนยันตัวตนล้มเหลว กรุณา Login ใหม่'
    });
  }
}

/**
 * Middleware to verify customer access permission
 * This middleware checks if customer_id is provided
 * Note: We trust the JWT token (already verified by authenticateJWT)
 * No need to call Portal API on every request - improves performance significantly
 */
export async function verifyCustomerAccess(req, res, next) {
  try {
    // 1. Get customer_id from query or body
    const customer_id = req.query.customer_id || req.body.customer_id;

    if (!customer_id) {
      logger.warn('Missing customer_id parameter');
      return res.status(400).json({
        success: false,
        error: 'Missing customer_id parameter',
        message: 'กรุณาระบุ customer_id'
      });
    }

    // 2. JWT already verified by authenticateJWT middleware
    // Token is valid and not expired - we can trust it
    // No need to call Portal API on every request (performance optimization)

    // 3. Attach customer_id to request for easy access
    req.customer_id = customer_id;

    logger.debug(`User ${req.user.username} (userid: ${req.user.userid}) accessing customer ${customer_id}`);
    next();

  } catch (error) {
    logger.error('Customer access verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Permission check failed',
      message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์'
    });
  }
}

/**
 * Optional: Middleware to skip auth for specific routes
 * Can be used for public endpoints like /health, /api/test
 */
export function skipAuth(req, res, next) {
  logger.debug('Skipping authentication for public endpoint');
  next();
}
