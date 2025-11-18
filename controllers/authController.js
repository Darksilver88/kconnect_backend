import logger from '../utils/logger.js';
import { getFirestore } from '../config/firebase.js';
import jwt from 'jsonwebtoken';

/**
 * Login endpoint - Forwards credentials to Portal API and returns JWT
 * @route POST /api/auth/login
 * @body { username, password }
 * @returns { success, data: { token, user }, message }
 */
export async function login(req, res) {
  try {
    const { username, password } = req.body;

    // 1. Validate input
    if (!username || !password) {
      logger.warn('Login attempt with missing credentials');
      return res.status(400).json({
        success: false,
        error: 'Missing credentials',
        message: 'กรุณากรอก username และ password'
      });
    }

    // 2. Get Portal API URL from environment
    const portalApiUrl = process.env.PORTAL_API_URL || 'https://portal-api.example.com';
    const loginEndpoint = `${portalApiUrl}/api/login`;

    logger.info(`Login attempt for user: ${username}`);

    // 3. Call Portal login API
    try {
      // Portal API requires application/x-www-form-urlencoded format
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      formData.append('securitycode', '');
      formData.append('expire', '2592000'); // 30 days (Portal bug makes it ~352 years)
      formData.append('permission', '');

      const portalResponse = await fetch(loginEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*'
        },
        body: formData.toString()
      });

      const portalData = await portalResponse.json();

      // Log Portal response for debugging
      logger.info(`Portal API response status: ${portalResponse.status}`);
      logger.info(`Portal API response body: ${JSON.stringify(portalData)}`);

      // 4. Handle Portal API response
      if (!portalResponse.ok) {
        logger.warn(`Portal login failed for user ${username}: ${portalData.message || 'Unknown error'}`);
        return res.status(portalResponse.status).json({
          success: false,
          error: portalData.error || 'Login failed',
          message: portalData.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
        });
      }

      // 5. Extract JWT token and user info from Portal response
      // Portal API returns token in "JWT" field (uppercase)
      const token = portalData.JWT || portalData.data?.token || portalData.token || portalData.data?.access_token || portalData.access_token;
      const userInfo = portalData.data?.user || portalData.user || portalData.data;

      if (!token) {
        logger.error('Portal API did not return a token');
        logger.error(`Portal response structure: ${JSON.stringify(portalData)}`);
        return res.status(500).json({
          success: false,
          error: 'Invalid response from Portal',
          message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
        });
      }

      // 6. Decode JWT to extract user info from values object
      const decoded = jwt.decode(token);
      const userValues = decoded?.values || {};

      logger.info(`Login successful for user: ${username} (userid: ${userValues.userid}, userlevel: ${userValues.userlevel})`);

      // 7. Return JWT and user info to frontend
      return res.status(200).json({
        success: true,
        data: {
          token: token,
          user: {
            userid: userValues.userid || null,
            username: userValues.username || username,
            userlevel: userValues.userlevel || null,
            userprimarykey: userValues.userprimarykey || null,
            parentuserid: userValues.parentuserid || null,
            permission: userValues.permission || false
          }
        },
        message: 'เข้าสู่ระบบสำเร็จ'
      });

    } catch (fetchError) {
      logger.error('Error calling Portal login API:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Portal API connection failed',
        message: 'ไม่สามารถเชื่อมต่อกับระบบ Portal ได้'
      });
    }

  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
    });
  }
}

/**
 * Verify token endpoint - Checks if JWT is still valid
 * @route GET /api/auth/verify
 * @header Authorization: Bearer <token>
 * @returns { success, data: { user }, message }
 */
export async function verifyToken(req, res) {
  try {
    // Token already verified by authenticateJWT middleware
    // Just return user info from req.user
    return res.status(200).json({
      success: true,
      data: {
        user: req.user
      },
      message: 'Token ถูกต้อง'
    });
  } catch (error) {
    logger.error('Verify token error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'เกิดข้อผิดพลาดในการตรวจสอบ token'
    });
  }
}

/**
 * Get allowed sites endpoint - Returns list of customers user can access
 * @route GET /api/auth/customer_list
 * @header Authorization: Bearer <token>
 * @returns { success, data: { customers }, message }
 */
export async function getAllowedSites(req, res) {
  try {
    // 1. Get Portal API URL from environment
    const portalApiUrl = process.env.PORTAL_API_URL || 'https://dev-portal.koder3.com';
    const allowSitesEndpoint = `${portalApiUrl}/api/user/${req.user.userid}/${req.user.userlevel}/allow_sites`;

    logger.debug(`Getting allowed sites for user ${req.user.username} (userid: ${req.user.userid}, userlevel: ${req.user.userlevel})`);

    // 2. Call Portal allow_sites API
    try {
      const allowSitesResponse = await fetch(allowSitesEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${req.user.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!allowSitesResponse.ok) {
        logger.error(`Portal API returned status ${allowSitesResponse.status}`);

        // If 401/403, token might be expired
        if (allowSitesResponse.status === 401 || allowSitesResponse.status === 403) {
          return res.status(401).json({
            success: false,
            error: 'Token expired or invalid',
            message: 'Token หมดอายุ กรุณา Login ใหม่'
          });
        }

        return res.status(allowSitesResponse.status).json({
          success: false,
          error: 'Failed to get allowed sites',
          message: 'ไม่สามารถดึงข้อมูลสิทธิ์การเข้าถึงได้'
        });
      }

      const allowSitesData = await allowSitesResponse.json();

      // 3. Query Firebase to convert k_product_customer_name → customer_code
      const customers = [];
      const db = getFirestore();

      if (allowSitesData.data && allowSitesData.data.sites && Array.isArray(allowSitesData.data.sites)) {
        for (const site of allowSitesData.data.sites) {
          if (site.k_product_customer_name) {
            try {
              // Query Firebase: customer WHERE name = k_product_customer_name
              const customerSnapshot = await db.collection('customer')
                .where('name', '==', site.k_product_customer_name)
                .limit(1)
                .get();

              if (!customerSnapshot.empty) {
                const customerDoc = customerSnapshot.docs[0];
                const customerData = customerDoc.data();

                customers.push({
                  customer_id: customerData.customer_code || null,
                  customer_name: site.k_product_customer_name,
                  site_name: site.site_name || null,
                  site_code: site.site_code || null
                });

                logger.debug(`Mapped customer "${site.k_product_customer_name}" to code "${customerData.customer_code}"`);
              } else {
                logger.warn(`No customer found in Firebase for name: ${site.k_product_customer_name}`);
                // Still add to list but with null customer_id
                customers.push({
                  customer_id: null,
                  customer_name: site.k_product_customer_name,
                  site_name: site.site_name || null,
                  site_code: site.site_code || null
                });
              }
            } catch (firebaseError) {
              logger.error(`Error querying Firebase for customer ${site.k_product_customer_name}:`, firebaseError);
              // Still add to list but with null customer_id
              customers.push({
                customer_id: null,
                customer_name: site.k_product_customer_name,
                site_name: site.site_name || null,
                site_code: site.site_code || null
              });
            }
          }
        }
      }

      // 4. Filter out customers with null customer_id
      const validCustomers = customers.filter(customer => customer.customer_id !== null);

      logger.info(`User ${req.user.username} has access to ${validCustomers.length} customers (${customers.length - validCustomers.length} filtered out due to missing customer_id)`);

      // 5. Return customer list (only valid customers)
      return res.status(200).json({
        success: true,
        data: {
          customers: validCustomers,
          total: validCustomers.length
        },
        message: 'ดึงข้อมูลสิทธิ์การเข้าถึงสำเร็จ'
      });

    } catch (fetchError) {
      logger.error('Error calling Portal allow_sites API:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Portal API connection failed',
        message: 'ไม่สามารถเชื่อมต่อกับระบบ Portal ได้'
      });
    }

  } catch (error) {
    logger.error('Get allowed sites error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสิทธิ์การเข้าถึง'
    });
  }
}
